"""
Chart capture utilities for the AgentCore Code Interpreter sandbox.

These helpers let execute_python transparently capture matplotlib and Plotly
figures as base64 PNGs and surface them to the UI as image events.

Usage pattern (inside a code interpreter tool):

    full_code = _PLOT_SETUP + user_code + "\n" + _PLOT_CLEANUP
    response = client.invoke("executeCode", {"code": full_code, ...})
    raw_output = ...  # collected from response content[*].text + resource.text
    blob_charts = ...  # collected from response content[*].resource.blob
    text_output, marker_charts = _extract_charts(raw_output)
    all_charts = marker_charts + blob_charts
    for b64 in all_charts:
        emit_image_event(b64, alt=_extract_chart_title(user_code) or "Chart")
"""

import base64
import logging
import os
import re
import uuid
from datetime import datetime
from typing import Optional

import boto3
from botocore.exceptions import BotoCoreError, ClientError

logger = logging.getLogger(__name__)

_S3_CLIENT = None


def _get_s3_client():
    global _S3_CLIENT
    if _S3_CLIENT is None:
        _S3_CLIENT = boto3.client("s3", region_name=os.getenv("AWS_REGION", "us-east-1"))
    return _S3_CLIENT


def upload_chart_to_s3(base64_data: str) -> Optional[str]:
    """Upload a base64-encoded PNG chart to the chat-charts S3 bucket.

    Returns the S3 object key on success, or None if the CHAT_CHARTS_BUCKET
    env var is not set or the upload fails. Callers should fall back to the
    in-memory base64 payload when this returns None.
    """
    bucket = os.getenv("CHAT_CHARTS_BUCKET", "").strip()
    if not bucket:
        return None

    try:
        png_bytes = base64.b64decode(base64_data)
    except (ValueError, TypeError) as e:
        logger.error(f"[ChartUpload] Invalid base64 payload: {e}")
        return None

    now = datetime.utcnow()
    key = f"charts/{now:%Y/%m/%d}/{uuid.uuid4().hex}.png"

    try:
        _get_s3_client().put_object(
            Bucket=bucket,
            Key=key,
            Body=png_bytes,
            ContentType="image/png",
        )
        logger.info(f"[ChartUpload] Uploaded chart to s3://{bucket}/{key} ({len(png_bytes)} bytes)")
        return key
    except (BotoCoreError, ClientError) as e:
        logger.error(f"[ChartUpload] Failed to upload chart to s3://{bucket}/{key}: {e}")
        return None


# Prepended to every code execution to:
#   1. Force non-interactive Agg backend (matplotlib needs no display).
#   2. Patch plt.show() to capture figures as base64 markers.
#   3. Install kaleido (Plotly PNG exporter) silently, idempotently.
#   4. Patch pio.show() / go.Figure.show() to capture Plotly figures too.
_PLOT_SETUP = """\
try:
    import matplotlib as _mpl
    try:
        _mpl.use('Agg')
    except Exception:
        pass
    import matplotlib.pyplot as _plt
    import io as _io, base64 as _b64

    def _capture_figures():
        for _fn in _plt.get_fignums():
            _f = _plt.figure(_fn)
            _buf = _io.BytesIO()
            _f.savefig(_buf, format='png', dpi=200, bbox_inches='tight')
            _buf.seek(0)
            print('__CHART__' + _b64.b64encode(_buf.read()).decode() + '__END_CHART__')
        _plt.close('all')

    _plt.show = lambda *a, **k: _capture_figures()
except ImportError:
    pass

# --- Plotly kaleido install (silent, idempotent) ---
try:
    import subprocess as _sp, sys as _sys
    _sp.check_call(
        [_sys.executable, '-m', 'pip', 'install', '-q', 'kaleido<1'],
        stdout=_sp.DEVNULL, stderr=_sp.DEVNULL
    )
except Exception:
    pass

# --- Plotly figure capture (mirrors matplotlib pattern) ---
try:
    import plotly.io as _pio
    import plotly.graph_objects as _go
    import base64 as _b64_plotly

    _original_pio_show = _pio.show

    def _plotly_capture(fig, *args, **kwargs):
        try:
            _img_bytes = fig.to_image(format='png', scale=3, engine='kaleido')
            print('__CHART__' + _b64_plotly.b64encode(_img_bytes).decode() + '__END_CHART__')
        except Exception as _e:
            print(f'[Plotly capture error: {_e}]')
            _original_pio_show(fig, *args, **kwargs)

    _pio.show = _plotly_capture
    _go.Figure.show = lambda self, *a, **k: _plotly_capture(self, *a, **k)
    _pio.renderers.default = 'png'
except Exception:
    pass
"""

# Appended AFTER the user's code to sweep any figures left open (e.g. if the
# agent used savefig + close selectively, or forgot plt.show()).
_PLOT_CLEANUP = """
try:
    import matplotlib.pyplot as _plt_c
    import io as _io_c, base64 as _b64_c
    for _fn_c in _plt_c.get_fignums():
        _f_c = _plt_c.figure(_fn_c)
        _buf_c = _io_c.BytesIO()
        _f_c.savefig(_buf_c, format='png', dpi=200, bbox_inches='tight')
        _buf_c.seek(0)
        print('__CHART__' + _b64_c.b64encode(_buf_c.read()).decode() + '__END_CHART__')
    _plt_c.close('all')
except Exception:
    pass
"""

_CHART_MARKER_PATTERN = re.compile(r"__CHART__(.+?)__END_CHART__", re.DOTALL)

# Patterns to extract chart titles from matplotlib / Plotly code.
_CHART_TITLE_PATTERNS = [
    re.compile(r"""plt\.title\(\s*(?:f?['"])(.*?)(?:['"]\s*[,)])"""),          # plt.title('...')
    re.compile(r"""\.update_layout\([^)]*title\s*=\s*(?:f?['"])(.*?)['"]"""),  # fig.update_layout(title='...')
    re.compile(r"""\.update_layout\([^)]*title\s*=\s*dict\(\s*text\s*=\s*(?:f?['"])(.*?)['"]"""),  # title=dict(text='...')
    re.compile(r"""go\.Figure\([^)]*\)\.update_layout\([^)]*title\s*=\s*(?:f?['"])(.*?)['"]"""),
]


def _extract_chart_title(code: str) -> Optional[str]:
    """Try to extract a chart title from matplotlib / Plotly code."""
    for pattern in _CHART_TITLE_PATTERNS:
        match = pattern.search(code)
        if match:
            title = match.group(1).strip()
            if title:
                return title
    return None


def _extract_charts(output: str) -> tuple[str, list[str]]:
    """Strip chart markers from code output and return the base64 payloads.

    Returns:
        (cleaned_output, [base64, ...])
    """
    charts: list[str] = []
    for match in _CHART_MARKER_PATTERN.finditer(output):
        charts.append(match.group(1).strip())
    cleaned = _CHART_MARKER_PATTERN.sub("", output).strip()
    return cleaned, charts
