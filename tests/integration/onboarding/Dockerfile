FROM node:20-slim

RUN apt-get update && apt-get install -y jq curl && rm -rf /var/lib/apt/lists/*

# Install packages from local tarballs (collected by run-test.sh)
COPY .staging/tarballs/ /tarballs/
RUN npm install -g /tarballs/indigoai-hq-cli-*.tgz && \
    npm install -g /tarballs/create-hq-*.tgz

# Copy test files
COPY mock-api.mjs /test/mock-api.mjs
COPY test-onboarding.sh /test/test-onboarding.sh
COPY fixtures/ /test/fixtures/
# Fix Windows CRLF line endings and set executable
RUN sed -i 's/\r$//' /test/test-onboarding.sh /test/mock-api.mjs && \
    chmod +x /test/test-onboarding.sh

WORKDIR /workspace
ENTRYPOINT ["/test/test-onboarding.sh"]
