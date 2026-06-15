# Beanola backend development targets.

PY ?= python3
VENV_PY ?= $(PY)
DJANGO_SETTINGS_MODULE ?= config.settings.dev

.PHONY: help api-quality schema-baseline api-quality-baseline test

help:
	@echo "Beanola backend targets:"
	@echo "  make test                  Run pytest (unit + property)"
	@echo "  make api-quality           Run schema-regen + linter + breaking-change detector vs baseline"
	@echo "  make schema-baseline       Regenerate backend/schema/openapi.v1.baseline.yaml"
	@echo "  make api-quality-baseline  Regenerate backend/schema/lint_baseline.json from current baseline"

test:
	$(VENV_PY) -m pytest tests/unit tests/property -q

api-quality:
	PY="$(VENV_PY)" bash scripts/api_quality.sh

schema-baseline:
	$(VENV_PY) manage.py spectacular --file schema/openapi.v1.baseline.yaml
	@echo "Baseline schema regenerated."

api-quality-baseline: schema-baseline
	$(VENV_PY) -c "import yaml, json; json.dump(yaml.safe_load(open('schema/openapi.v1.baseline.yaml')), open('/tmp/baseline_schema.json','w'))"
	$(VENV_PY) ../.kiro/skills/api-design-reviewer/scripts/api_linter.py --format json /tmp/baseline_schema.json --output schema/lint_baseline.json
	@echo "Lint baseline regenerated."
