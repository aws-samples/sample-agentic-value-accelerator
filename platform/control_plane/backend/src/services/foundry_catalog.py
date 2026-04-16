"""FSI Foundry catalog service — reads offerings.json and provides use cases as deployable items"""

import json
import logging
from pathlib import Path
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)


class FoundryUseCase:
    """Represents an FSI Foundry use case from offerings.json"""
    def __init__(self, data: dict, base_path: str):
        self.id = data["id"]
        self.use_case_name = data["use_case_name"]
        self.name = data["name"]
        self.description = data["description"]
        self.application_path = data["application_path"]
        self.data_path = data.get("data_path", "")
        self.supported_frameworks = data.get("supported_frameworks", [])
        self.supported_patterns = data.get("supported_patterns", [])
        self.agents = data.get("agents", [])
        self.base_path = base_path

    @property
    def full_path(self) -> str:
        return str(Path(self.base_path) / self.application_path)


class FoundryCatalog:
    """Reads FSI Foundry offerings.json and provides use case metadata"""

    def __init__(self, offerings_path: str):
        self.offerings_path = Path(offerings_path)
        self._use_cases: Dict[str, FoundryUseCase] = {}
        self._load()

    def _load(self):
        if not self.offerings_path.exists():
            logger.warning(f"Offerings file not found: {self.offerings_path}")
            return
        with open(self.offerings_path) as f:
            data = json.load(f)
        base_path = str(self.offerings_path.parent.parent.parent.parent.parent)
        for uc in data.get("use_cases", []):
            use_case = FoundryUseCase(uc, base_path)
            self._use_cases[uc["use_case_name"]] = use_case
        logger.info(f"Loaded {len(self._use_cases)} FSI Foundry use cases")

    def list_use_cases(self) -> List[FoundryUseCase]:
        return list(self._use_cases.values())

    def get_use_case(self, use_case_name: str) -> Optional[FoundryUseCase]:
        return self._use_cases.get(use_case_name)
