import logging

logger = logging.getLogger('apps.common.metrics')


def emit_metric(metric_name: str, **dimensions):
    logger.info(metric_name, extra={'type': 'app_metric', 'metric': metric_name, **dimensions})
