# Lambda container image for Step Functions deployment
# Supports frameworks that exceed Lambda's 250MB ZIP limit (e.g., Strands)

ARG PYTHON_VERSION=3.11

FROM public.ecr.aws/lambda/python:${PYTHON_VERSION} AS base

# Build args
ARG USE_CASE_ID=kyc_banking
ARG FRAMEWORK=langchain_langgraph

# Install base requirements
COPY applications/fsi_foundry/foundations/src/requirements/requirements.txt ./requirements/
COPY applications/fsi_foundry/foundations/src/requirements/requirements_strands.txt ./requirements/
RUN pip install --no-cache-dir -r requirements/requirements.txt -q

# Install framework-specific requirements
RUN if [ "${FRAMEWORK}" = "strands" ]; then \
        pip install --no-cache-dir -r requirements/requirements_strands.txt -q; \
    fi

# Copy platform source
COPY applications/fsi_foundry/foundations/src/ ${LAMBDA_TASK_ROOT}/

# Copy use case code
RUN mkdir -p ${LAMBDA_TASK_ROOT}/use_cases
COPY applications/fsi_foundry/use_cases/${USE_CASE_ID}/src/${FRAMEWORK}/ ${LAMBDA_TASK_ROOT}/use_cases/${USE_CASE_ID}/
RUN echo '"""AVA Use Cases."""' > ${LAMBDA_TASK_ROOT}/use_cases/__init__.py

# Lambda handler
CMD ["main.lambda_handler"]
