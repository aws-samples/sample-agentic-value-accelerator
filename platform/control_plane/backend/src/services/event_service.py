"""EventBridge event service for publishing deployment lifecycle events"""

import boto3
import json
import logging
from typing import Dict, Any

logger = logging.getLogger(__name__)


class EventService:
    """Publishes deployment events to EventBridge"""

    SOURCE = "fsi.control-plane"
    STATUS_CHANGE_DETAIL_TYPE = "DeploymentStatusChange"

    def __init__(self, event_bus_name: str = "fsi-deployment-events", region: str = "us-east-1"):
        self.eb_client = boto3.client("events", region_name=region)
        self.event_bus_name = event_bus_name

    def publish_status_change(self, deployment_id: str, template_id: str,
                              new_status: str, timestamp: str) -> None:
        """Publish a deployment status change event.

        Sends an event to EventBridge with the deployment_id, template_id,
        new status, and timestamp so other systems can react to state changes.
        """
        detail = {
            "deployment_id": deployment_id,
            "template_id": template_id,
            "status": new_status,
            "timestamp": timestamp,
        }

        self.eb_client.put_events(
            Entries=[
                {
                    "Source": self.SOURCE,
                    "DetailType": self.STATUS_CHANGE_DETAIL_TYPE,
                    "Detail": json.dumps(detail),
                    "EventBusName": self.event_bus_name,
                }
            ]
        )
        logger.info(
            f"Published status change event: deployment={deployment_id} "
            f"status={new_status}"
        )

    def publish_job_event(self, event_type: str, detail: dict) -> None:
        """Publish a template job event (onboarding/offboarding).

        Uses the template job's event name as the detail-type so EventBridge
        rules can route it to the appropriate target.
        """
        self.eb_client.put_events(
            Entries=[
                {
                    "Source": self.SOURCE,
                    "DetailType": event_type,
                    "Detail": json.dumps(detail),
                    "EventBusName": self.event_bus_name,
                }
            ]
        )
        logger.info(f"Published job event: type={event_type}")
