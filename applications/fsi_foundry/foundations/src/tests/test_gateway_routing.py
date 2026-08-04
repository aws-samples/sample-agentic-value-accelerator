"""Unit tests for LLM Gateway routing logic.

Tests the factory methods in the four base classes to verify:
1. Gateway path returns ChatLiteLLM / LiteLLMModel with correct model prefix
2. Direct path returns ChatBedrockConverse / BedrockModel (no prefix)
3. Fail-closed in production when key is unavailable
4. Fail-open in dev (LOCAL_MODE=true) when key is unavailable
5. gateway_model_id() idempotency (no double prefix)
6. gateway_base_url() raises on misconfiguration
"""

import os
import sys
from unittest.mock import patch, MagicMock

import pytest

# Ensure src is on the path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


# ---------------------------------------------------------------------------
# Helpers: clear lru_cache between tests
# ---------------------------------------------------------------------------
@pytest.fixture(autouse=True)
def clear_gateway_cache():
    """Clear resolve_gateway_api_key cache before each test."""
    from utils.llm_gateway import resolve_gateway_api_key
    resolve_gateway_api_key.cache_clear()
    yield
    resolve_gateway_api_key.cache_clear()


# ---------------------------------------------------------------------------
# Test: gateway_model_id()
# ---------------------------------------------------------------------------
class TestGatewayModelId:
    def test_adds_prefix(self):
        from utils.llm_gateway import gateway_model_id
        result = gateway_model_id("us.anthropic.claude-haiku-4-5-20251001-v1:0")
        assert result == "litellm_proxy/us.anthropic.claude-haiku-4-5-20251001-v1:0"

    def test_no_double_prefix(self):
        from utils.llm_gateway import gateway_model_id
        already_prefixed = "litellm_proxy/us.anthropic.claude-haiku-4-5-20251001-v1:0"
        result = gateway_model_id(already_prefixed)
        assert result == already_prefixed

    def test_works_with_display_alias(self):
        from utils.llm_gateway import gateway_model_id
        result = gateway_model_id("Claude Haiku 4.5")
        assert result == "litellm_proxy/Claude Haiku 4.5"


# ---------------------------------------------------------------------------
# Test: gateway_base_url()
# ---------------------------------------------------------------------------
class TestGatewayBaseUrl:
    @patch("config.settings.settings")
    def test_returns_url_without_trailing_slash(self, mock_settings):
        mock_settings.use_llm_gateway = True
        mock_settings.llm_gateway_base_url = "http://gateway:4000/"
        from utils.llm_gateway import gateway_base_url
        assert gateway_base_url() == "http://gateway:4000"

    @patch("config.settings.settings")
    def test_raises_when_gateway_disabled(self, mock_settings):
        mock_settings.use_llm_gateway = False
        from utils.llm_gateway import gateway_base_url, GatewayConfigurationError
        with pytest.raises(GatewayConfigurationError):
            gateway_base_url()

    @patch("config.settings.settings")
    def test_raises_when_url_empty(self, mock_settings):
        mock_settings.use_llm_gateway = True
        mock_settings.llm_gateway_base_url = ""
        from utils.llm_gateway import gateway_base_url, GatewayConfigurationError
        with pytest.raises(GatewayConfigurationError):
            gateway_base_url()


# ---------------------------------------------------------------------------
# Test: LangGraph Agent _create_llm()
# ---------------------------------------------------------------------------
class TestLangGraphAgentGatewayRouting:
    @patch("config.settings.settings")
    @patch("utils.llm_gateway.resolve_gateway_api_key", return_value="sk-test-key")
    def test_gateway_returns_chat_litellm(self, mock_key, mock_settings):
        mock_settings.use_llm_gateway = True
        mock_settings.llm_gateway_base_url = "http://gateway:4000"
        mock_settings.bedrock_model_id = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
        mock_settings.effective_bedrock_model_id = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
        mock_settings.aws_region = "us-east-2"
        mock_settings.enable_tracing = False

        from base.langgraph.agent import LangGraphAgent
        from langchain_litellm import ChatLiteLLM

        # Create a concrete subclass
        class TestAgent(LangGraphAgent):
            name = "test_agent"
            system_prompt = "test"
            tools = []

        agent = TestAgent()
        llm = agent._create_llm()

        assert isinstance(llm, ChatLiteLLM)
        assert "litellm_proxy/" in llm.model
        assert "/v1" not in (llm.api_base or "")

    @patch("base.langgraph.agent.settings")
    def test_direct_returns_bedrock_converse(self, mock_settings):
        mock_settings.use_llm_gateway = False
        mock_settings.llm_gateway_base_url = None
        mock_settings.bedrock_model_id = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
        mock_settings.effective_bedrock_model_id = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
        mock_settings.aws_region = "us-east-2"
        mock_settings.enable_tracing = False

        from base.langgraph.agent import LangGraphAgent
        from langchain_aws import ChatBedrockConverse

        class TestAgent(LangGraphAgent):
            name = "test_agent"
            system_prompt = "test"
            tools = []

        agent = TestAgent()
        llm = agent._create_llm()

        assert isinstance(llm, ChatBedrockConverse)

    @patch.dict(os.environ, {"LOCAL_MODE": ""})
    @patch("config.settings.settings")
    @patch("utils.llm_gateway.resolve_gateway_api_key", return_value=None)
    def test_gateway_fails_closed_in_production(self, mock_key, mock_settings):
        mock_settings.use_llm_gateway = True
        mock_settings.llm_gateway_base_url = "http://gateway:4000"
        mock_settings.bedrock_model_id = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
        mock_settings.effective_bedrock_model_id = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
        mock_settings.aws_region = "us-east-2"
        mock_settings.enable_tracing = False

        from base.langgraph.agent import LangGraphAgent
        from utils.llm_gateway import GatewayConfigurationError

        class TestAgent(LangGraphAgent):
            name = "test_agent"
            system_prompt = "test"
            tools = []

        agent = TestAgent()
        with pytest.raises(GatewayConfigurationError):
            agent._create_llm()

    @patch.dict(os.environ, {"LOCAL_MODE": "true"})
    @patch("config.settings.settings")
    @patch("utils.llm_gateway.resolve_gateway_api_key", return_value=None)
    def test_gateway_fails_open_in_dev(self, mock_key, mock_settings):
        mock_settings.use_llm_gateway = True
        mock_settings.llm_gateway_base_url = "http://gateway:4000"
        mock_settings.bedrock_model_id = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
        mock_settings.effective_bedrock_model_id = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
        mock_settings.aws_region = "us-east-2"
        mock_settings.enable_tracing = False

        from base.langgraph.agent import LangGraphAgent
        from langchain_aws import ChatBedrockConverse

        class TestAgent(LangGraphAgent):
            name = "test_agent"
            system_prompt = "test"
            tools = []

        agent = TestAgent()
        llm = agent._create_llm()

        # Should fall back to direct Bedrock, not raise
        assert isinstance(llm, ChatBedrockConverse)


# ---------------------------------------------------------------------------
# Test: LangGraph Orchestrator _create_llm()
# ---------------------------------------------------------------------------
class TestLangGraphOrchestratorGatewayRouting:
    @patch("config.settings.settings")
    @patch("utils.llm_gateway.resolve_gateway_api_key", return_value="sk-test-key")
    def test_gateway_returns_chat_litellm(self, mock_key, mock_settings):
        mock_settings.use_llm_gateway = True
        mock_settings.llm_gateway_base_url = "http://gateway:4000"
        mock_settings.bedrock_model_id = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
        mock_settings.effective_bedrock_model_id = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
        mock_settings.aws_region = "us-east-2"

        from base.langgraph.orchestrator import LangGraphOrchestrator
        from langchain_litellm import ChatLiteLLM

        class TestOrch(LangGraphOrchestrator):
            name = "test_orch"

            def build_graph(self):
                pass

        orch = TestOrch()
        llm = orch._create_llm()

        assert isinstance(llm, ChatLiteLLM)
        assert "litellm_proxy/" in llm.model

    @patch.dict(os.environ, {"LOCAL_MODE": ""})
    @patch("config.settings.settings")
    @patch("utils.llm_gateway.resolve_gateway_api_key", return_value=None)
    def test_gateway_fails_closed_in_production(self, mock_key, mock_settings):
        mock_settings.use_llm_gateway = True
        mock_settings.llm_gateway_base_url = "http://gateway:4000"
        mock_settings.bedrock_model_id = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
        mock_settings.effective_bedrock_model_id = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
        mock_settings.aws_region = "us-east-2"

        from base.langgraph.orchestrator import LangGraphOrchestrator
        from utils.llm_gateway import GatewayConfigurationError

        class TestOrch(LangGraphOrchestrator):
            name = "test_orch"

            def build_graph(self):
                pass

        orch = TestOrch()
        with pytest.raises(GatewayConfigurationError):
            orch._create_llm()


# ---------------------------------------------------------------------------
# Test: Strands Agent _create_model()
# ---------------------------------------------------------------------------
class TestStrandsAgentGatewayRouting:
    @patch("config.settings.settings")
    @patch("utils.llm_gateway.resolve_gateway_api_key", return_value="sk-test-key")
    def test_gateway_returns_litellm_model(self, mock_key, mock_settings):
        mock_settings.use_llm_gateway = True
        mock_settings.llm_gateway_base_url = "http://gateway:4000"
        mock_settings.effective_bedrock_model_id = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
        mock_settings.aws_region = "us-east-2"
        mock_settings.enable_tracing = False
        mock_settings.guardrail_id = None

        from base.strands.agent import StrandsAgent
        from strands.models.litellm import LiteLLMModel

        class TestAgent(StrandsAgent):
            name = "test_strands"
            system_prompt = "test"
            tools = []

        agent = TestAgent()
        model = agent._create_model()

        assert isinstance(model, LiteLLMModel)

    @patch("base.strands.agent.settings")
    def test_direct_returns_bedrock_model(self, mock_settings):
        mock_settings.use_llm_gateway = False
        mock_settings.llm_gateway_base_url = None
        mock_settings.effective_bedrock_model_id = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
        mock_settings.aws_region = "us-east-2"
        mock_settings.enable_tracing = False
        mock_settings.guardrail_id = None

        from base.strands.agent import StrandsAgent
        from strands.models import BedrockModel

        class TestAgent(StrandsAgent):
            name = "test_strands"
            system_prompt = "test"
            tools = []

        agent = TestAgent()
        model = agent._create_model()

        assert isinstance(model, BedrockModel)

    @patch.dict(os.environ, {"LOCAL_MODE": ""})
    @patch("config.settings.settings")
    @patch("utils.llm_gateway.resolve_gateway_api_key", return_value=None)
    def test_gateway_fails_closed_in_production(self, mock_key, mock_settings):
        mock_settings.use_llm_gateway = True
        mock_settings.llm_gateway_base_url = "http://gateway:4000"
        mock_settings.effective_bedrock_model_id = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
        mock_settings.aws_region = "us-east-2"
        mock_settings.enable_tracing = False
        mock_settings.guardrail_id = None

        from base.strands.agent import StrandsAgent
        from utils.llm_gateway import GatewayConfigurationError

        class TestAgent(StrandsAgent):
            name = "test_strands"
            system_prompt = "test"
            tools = []

        agent = TestAgent()
        with pytest.raises(GatewayConfigurationError):
            agent._create_model()


# ---------------------------------------------------------------------------
# Test: Strands Orchestrator _create_synthesis_agent()
# ---------------------------------------------------------------------------
class TestStrandsOrchestratorGatewayRouting:
    @patch("config.settings.settings")
    @patch("utils.llm_gateway.resolve_gateway_api_key", return_value="sk-test-key")
    def test_gateway_returns_agent_with_litellm_model(self, mock_key, mock_settings):
        mock_settings.use_llm_gateway = True
        mock_settings.llm_gateway_base_url = "http://gateway:4000"
        mock_settings.bedrock_model_id = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
        mock_settings.effective_bedrock_model_id = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
        mock_settings.aws_region = "us-east-2"

        from base.strands.orchestrator import StrandsOrchestrator
        from strands import Agent

        class TestOrch(StrandsOrchestrator):
            name = "test_orch"

        orch = TestOrch()
        synthesis_agent = orch._create_synthesis_agent()

        assert isinstance(synthesis_agent, Agent)

    @patch.dict(os.environ, {"LOCAL_MODE": ""})
    @patch("config.settings.settings")
    @patch("utils.llm_gateway.resolve_gateway_api_key", return_value=None)
    def test_gateway_fails_closed_in_production(self, mock_key, mock_settings):
        mock_settings.use_llm_gateway = True
        mock_settings.llm_gateway_base_url = "http://gateway:4000"
        mock_settings.bedrock_model_id = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
        mock_settings.effective_bedrock_model_id = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
        mock_settings.aws_region = "us-east-2"

        from base.strands.orchestrator import StrandsOrchestrator
        from utils.llm_gateway import GatewayConfigurationError

        class TestOrch(StrandsOrchestrator):
            name = "test_orch"

        orch = TestOrch()
        with pytest.raises(GatewayConfigurationError):
            orch._create_synthesis_agent()


# ---------------------------------------------------------------------------
# Test: Config Generator dual aliases
# ---------------------------------------------------------------------------
class TestConfigGeneratorDualAliases:
    @staticmethod
    def _backend_src():
        """Compute path to platform/control_plane/backend/src from repo root."""
        # tests/test_gateway_routing.py is at:
        # <repo>/applications/fsi_foundry/foundations/src/tests/test_gateway_routing.py
        # repo root is 5 dirs up from this file
        repo_root = os.path.dirname(os.path.dirname(os.path.dirname(
            os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))))
        return os.path.join(repo_root, "platform", "control_plane", "backend", "src")

    def test_emits_two_entries_per_model(self):
        backend_src = self._backend_src()
        if backend_src not in sys.path:
            sys.path.insert(0, backend_src)

        from services.config_generator import ConfigGenerator, ModelCatalogEntry

        entry = ModelCatalogEntry(
            model_id="us.anthropic.claude-haiku-4-5-20251001-v1:0",
            display_name="Claude Haiku 4.5",
            provider="bedrock",
            litellm_prefix="bedrock/",
            region="us-east-2",
            mode="chat",
            input_cost_per_token=8.0e-07,
            output_cost_per_token=4.0e-06,
            max_input_tokens=200000,
            max_output_tokens=8192,
        )

        gen = ConfigGenerator()
        model_list = gen._build_model_list([entry])

        assert len(model_list) == 2
        assert model_list[0]["model_name"] == "Claude Haiku 4.5"
        assert model_list[1]["model_name"] == "us.anthropic.claude-haiku-4-5-20251001-v1:0"
        # Both should route to the same backend
        assert model_list[0]["litellm_params"]["model"] == model_list[1]["litellm_params"]["model"]

    def test_no_duplicate_when_display_equals_model_id(self):
        backend_src = self._backend_src()
        if backend_src not in sys.path:
            sys.path.insert(0, backend_src)

        from services.config_generator import ConfigGenerator, ModelCatalogEntry

        # Edge case: if someone sets display_name == model_id, don't duplicate
        entry = ModelCatalogEntry(
            model_id="us.anthropic.claude-haiku-4-5-20251001-v1:0",
            display_name="us.anthropic.claude-haiku-4-5-20251001-v1:0",
            provider="bedrock",
            litellm_prefix="bedrock/",
            region="us-east-2",
            mode="chat",
        )

        gen = ConfigGenerator()
        model_list = gen._build_model_list([entry])

        assert len(model_list) == 1

    def test_mantle_models_get_mode_chat_in_litellm_params(self):
        backend_src = self._backend_src()
        if backend_src not in sys.path:
            sys.path.insert(0, backend_src)

        from services.config_generator import ConfigGenerator, ModelCatalogEntry

        entry = ModelCatalogEntry(
            model_id="openai.gpt-5.5",
            display_name="GPT-5.5",
            provider="bedrock-mantle",
            litellm_prefix="bedrock_mantle/",
            region="us-east-2",
            mode="chat",
        )

        gen = ConfigGenerator()
        model_list = gen._build_model_list([entry])

        # Both aliases should have mode: chat in litellm_params
        for item in model_list:
            assert item["litellm_params"].get("mode") == "chat", (
                f"Model '{item['model_name']}' missing mode:chat in litellm_params"
            )

    def test_bedrock_models_do_not_get_mode_in_litellm_params(self):
        backend_src = self._backend_src()
        if backend_src not in sys.path:
            sys.path.insert(0, backend_src)

        from services.config_generator import ConfigGenerator, ModelCatalogEntry

        entry = ModelCatalogEntry(
            model_id="us.anthropic.claude-haiku-4-5-20251001-v1:0",
            display_name="Claude Haiku 4.5",
            provider="bedrock",
            litellm_prefix="bedrock/",
            region="us-east-2",
            mode="chat",
        )

        gen = ConfigGenerator()
        model_list = gen._build_model_list([entry])

        # Bedrock models don't need mode override (no auto-detection issue)
        for item in model_list:
            assert "mode" not in item["litellm_params"], (
                f"Model '{item['model_name']}' should not have mode in litellm_params"
            )
