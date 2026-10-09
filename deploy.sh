#!/usr/bin/env bash
set -e

# Default Deployment Settings from gemini.md
GCP_PROJECT="ge-app-project-alex"
GCP_REGION="europe-west1"
FIREBASE_PROJECT="techno-machine"
AUTH_PROJECT="aosterloh-cs-muc"
SERVICE_NAME="vinyl-tipper"
PORT="${PORT:-8080}"

authorize_domain() {
  local target_domain="$1"
  if [ -z "$target_domain" ]; then return 0; fi
  # Strip protocol and port if present
  target_domain=$(echo "$target_domain" | sed -E 's|^https?://||; s|:[0-9]+$||; s|/.*$||')
  echo "Checking & authorizing domain in ${AUTH_PROJECT}: ${target_domain}..."
  node -e '
  const { execSync } = require("child_process");
  const https = require("https");
  try {
    const token = execSync("export PATH=\"$HOME/google-cloud-sdk/bin:$PATH\"; gcloud auth print-access-token").toString().trim();
    const project = "aosterloh-cs-muc";
    const domain = process.argv[1];
    if (!domain) process.exit(0);

    const req = https.request({
      hostname: "identitytoolkit.googleapis.com",
      path: "/admin/v2/projects/" + project + "/config",
      method: "GET",
      headers: { "Authorization": "Bearer " + token, "x-goog-user-project": project }
    }, res => {
      let body = ""; res.on("data", d => body += d);
      res.on("end", () => {
        try {
          const json = JSON.parse(body);
          const domains = new Set(json.authorizedDomains || []);
          if (domains.has(domain)) { console.log("Domain already authorized:", domain); return; }
          domains.add(domain);
          const patchData = JSON.stringify({ authorizedDomains: Array.from(domains).sort() });
          const patchReq = https.request({
            hostname: "identitytoolkit.googleapis.com",
            path: "/admin/v2/projects/" + project + "/config?updateMask=authorizedDomains",
            method: "PATCH",
            headers: {
              "Authorization": "Bearer " + token,
              "x-goog-user-project": project,
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(patchData)
            }
          }, pRes => {
            console.log(pRes.statusCode === 200 ? "Successfully added " + domain + " to authorized domains" : "Failed to add domain (status " + pRes.statusCode + ")");
          });
          patchReq.write(patchData);
          patchReq.end();
        } catch (e) {
          console.warn("Could not parse identitytoolkit response:", e.message);
        }
      });
    });
    req.on("error", err => console.warn("Auth request error:", err.message));
    req.end();
  } catch (err) {
    console.warn("Domain authorization skipped (gcloud auth error):", err.message);
  }
  ' "$target_domain" || true
}

TARGET="${1:-local}"

case "$TARGET" in
  local)
    echo "Starting Vinyl Tipper locally on port ${PORT}..."
    node server.js
    ;;

  docker)
    echo "Building and running Docker container locally..."
    docker build -t "${SERVICE_NAME}:latest" .
    docker run --rm -p "${PORT}:8080" "${SERVICE_NAME}:latest"
    ;;

  firebase)
    echo "Deploying frontend to Firebase Hosting (${FIREBASE_PROJECT})..."
    firebase use "${FIREBASE_PROJECT}"
    firebase deploy --only hosting
    FIREBASE_URL="https://${FIREBASE_PROJECT}.web.app"
    authorize_domain "$FIREBASE_URL"
    echo "Firebase deployment complete: ${FIREBASE_URL}"
    ;;

  cloudrun)
    echo "Deploying to Google Cloud Run (${GCP_PROJECT} in ${GCP_REGION})..."
    gcloud config set project "${GCP_PROJECT}"
    gcloud builds submit --tag "gcr.io/${GCP_PROJECT}/${SERVICE_NAME}"
    gcloud run deploy "${SERVICE_NAME}" \
      --image "gcr.io/${GCP_PROJECT}/${SERVICE_NAME}" \
      --platform managed \
      --region "${GCP_REGION}" \
      --allow-unauthenticated \
      --port 8080
    
    SERVICE_URL=$(gcloud run services describe "${SERVICE_NAME}" --platform managed --region "${GCP_REGION}" --format 'value(status.url)')
    authorize_domain "$SERVICE_URL"
    echo "Cloud Run deployment complete: ${SERVICE_URL}"
    ;;

  *)
    echo "Usage: $0 [local|docker|firebase|cloudrun]"
    exit 1
    ;;
esac
