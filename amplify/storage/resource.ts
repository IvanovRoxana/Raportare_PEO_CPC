import { defineStorage } from "@aws-amplify/backend";

export const storage = defineStorage({
  name: "peoRaportareFiles",
  access: (allow) => ({
    "deliverables/{entity_id}/*": [
      allow.entity("identity").to(["read", "write", "delete"]),
      allow.groups(["pm", "admin"]).to(["read", "write", "delete"]),
    ],
    "deliverable-index/*": [
      allow.authenticated.to(["read", "write"]),
      allow.groups(["pm", "admin"]).to(["read", "write", "delete"]),
    ],
    "projects/*": [
      allow.authenticated.to(["read", "write"]),
      allow.groups(["pm", "admin"]).to(["read", "write", "delete"]),
    ],
    "projects/{project_id}/documents/*": [
      allow.authenticated.to(["read", "write"]),
      allow.groups(["pm", "admin"]).to(["read", "write", "delete"]),
    ],
    "reports/{entity_id}/*": [
      allow.entity("identity").to(["read", "write", "delete"]),
      allow.groups(["pm", "admin"]).to(["read", "write", "delete"]),
    ],
    "historical-import/*": [
      allow.groups(["pm", "admin"]).to(["read", "write", "delete"]),
    ],
    "project-assets/*": [
      allow.authenticated.to(["read"]),
      allow.groups(["pm", "admin"]).to(["read", "write", "delete"]),
    ],
    "profile-photos/*": [
      allow.authenticated.to(["read", "write"]),
      allow.groups(["pm", "admin"]).to(["read", "write", "delete"]),
    ],
  }),
});
