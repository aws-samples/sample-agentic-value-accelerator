"""
Generate fact_ecomm CSV from pre-generated XML files.

Reads XML files from a directory (one per conversation) and produces
a one-row-per-conversation CSV with raw XML body columns.
"""

import random
import xml.etree.ElementTree as ET
from pathlib import Path

from .constants import APP_IM_CODES, APP_TYPE_MAP
from .csv_writer import write_csv
from .models import SyntheticECommRecord


def generate_ecomm_from_xml(
    rng: random.Random,
    output_dir: Path,
    xml_dir: str,
) -> list[SyntheticECommRecord]:
    """Parse XML files from *xml_dir* and write fact_ecomm_synth.csv.

    Each XML file produces one row.  The app_code / app_type are assigned
    by cycling through the IM app codes from constants.py.

    Args:
        rng: Seeded Random instance for reproducibility.
        output_dir: Directory where the CSV will be written.
        xml_dir: Path to the directory containing XML files.

    Returns:
        List of SyntheticECommRecord instances that were written.
    """
    xml_path = Path(xml_dir)
    if not xml_path.is_dir():
        print(f"  WARNING: XML directory not found: {xml_path}")
        return []

    xml_files = sorted(xml_path.glob("*.xml"))
    if not xml_files:
        print(f"  WARNING: No XML files found in {xml_path}")
        return []

    print(f"  Found {len(xml_files)} XML files in {xml_path}")

    # Shuffle app codes for variety, then cycle through them
    app_codes = list(APP_IM_CODES)
    rng.shuffle(app_codes)

    records: list[SyntheticECommRecord] = []

    for i, xml_file in enumerate(xml_files):
        try:
            tree = ET.parse(xml_file)
        except ET.ParseError as e:
            print(f"  WARNING: Failed to parse {xml_file.name}: {e}")
            continue

        root = tree.getroot()

        # Extract header fields
        header = root.find("Header")
        if header is None:
            print(f"  WARNING: No <Header> in {xml_file.name}, skipping")
            continue

        conversation_id = (header.findtext("ConversationId") or "").strip()
        conversation_date = (header.findtext("ConversationDate") or "").strip()
        start_timestamp = (header.findtext("StartTimestamp") or "").strip()
        end_timestamp = (header.findtext("EndTimestamp") or "").strip()
        timezone = (header.findtext("Timezone") or "").strip()

        if not conversation_id:
            print(f"  WARNING: No ConversationId in {xml_file.name}, skipping")
            continue

        # Serialize <Participants> and <Chat> elements to strings
        participants_el = root.find("Participants")
        chat_el = root.find("Chat")

        participants_body = (
            ET.tostring(participants_el, encoding="unicode")
            if participants_el is not None
            else ""
        )
        chat_body = (
            ET.tostring(chat_el, encoding="unicode")
            if chat_el is not None
            else ""
        )

        # Assign app code by cycling
        app_code = app_codes[i % len(app_codes)]
        app_type = APP_TYPE_MAP.get(app_code, "Instant Messenger")

        records.append(
            SyntheticECommRecord(
                conversation_id=conversation_id,
                app_code=app_code,
                app_type=app_type,
                date=conversation_date,
                start_timestamp=start_timestamp,
                end_timestamp=end_timestamp,
                timezone=timezone,
                participants_body=participants_body,
                chat_body=chat_body,
            )
        )

    if records:
        output_path = output_dir / "fact_ecomm_synth.csv"
        write_csv(records, output_path)
        print(f"  Wrote {len(records)} records to {output_path.name}")

    return records
