// SCR-SETTINGS-MODELS
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Act, GoTo } from "../../app/navigation/go-to.tsx";
import { useEngineAction } from "../../app/runtime/engine-query.tsx";
import { usePort } from "../../app/runtime/port.tsx";
import {
  type ModelCapability,
  type ModelConnection,
  type ModelSettings,
  settingsPort,
} from "../../ports/settings-port.ts";
import { buttonClass } from "../../ui/button-styles.ts";
import { QueryView } from "../../ui/query-view.tsx";
import { StatusPill } from "../../ui/status-pill.tsx";
import { TextField } from "../../ui/text-field.tsx";
import { SettingsLayout } from "./settings-layout.tsx";

const CAPABILITIES: Record<ModelCapability, { label: string; purpose: string }> = {
  reasoning: { label: "Reasoning", purpose: "chat, design, coaching" },
  vision: { label: "Vision", purpose: "watches test runs" },
  image: { label: "Images", purpose: "skins and thumbnails" },
  pose: { label: "Pose", purpose: "copies motion from video" },
};

export function ModelsPage() {
  const settings = usePort(settingsPort);
  const query = useQuery({ queryKey: ["settings", "models"], queryFn: settings.getModelSettings });
  return (
    <SettingsLayout
      section="models"
      wide
      title="AI models"
      description="Icarus uses one connection per skill. Keys are stored on this computer and never shared."
    >
      <QueryView query={query}>{(models) => <ModelsForm models={models} />}</QueryView>
    </SettingsLayout>
  );
}

function ModelsForm({ models }: { models: ModelSettings }) {
  const settings = usePort(settingsPort);
  const client = useQueryClient();
  const [endpoint, setEndpoint] = useState(models.endpoint);
  const [apiKey, setApiKey] = useState("");
  const refresh = { onSuccess: () => client.invalidateQueries({ queryKey: ["settings", "models"] }) };
  const test = useEngineAction(settings.testModelConnection);
  const save = useEngineAction(settings.saveModelSettings);
  return (
    <>
      {models.connections.map((connection) => (
        <ConnectionRow key={connection.capability} connection={connection} />
      ))}
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Endpoint" mono value={endpoint} onChange={(event) => setEndpoint(event.target.value)} />
        <TextField
          label="API key"
          mono
          type="password"
          autoComplete="off"
          value={apiKey}
          placeholder={`•••••••••••••••• ${models.apiKeyHint}`}
          onChange={(event) => setApiKey(event.target.value)}
        />
      </div>
      <div className="flex gap-2">
        <Act
          cta="Test connection"
          onClick={() => test.mutate(undefined, refresh)}
          className={buttonClass("secondary", "h-8.5 px-4 text-body")}
        >
          Test connection
        </Act>
        <GoTo
          to="SCR-HOME"
          cta="Save"
          onClick={() => save.mutate({ endpoint, apiKey }, refresh)}
          className={buttonClass("primary", "h-8.5 text-body")}
        >
          Save
        </GoTo>
      </div>
    </>
  );
}

function ConnectionRow({ connection }: { connection: ModelConnection }) {
  const { label, purpose } = CAPABILITIES[connection.capability];
  return (
    <div className="grid grid-cols-[150px_minmax(0,1fr)_auto] items-center gap-3 rounded-card-sm bg-control px-3.5 py-3">
      <span className="flex flex-col">
        <span className="leading-tight font-semibold">{label}</span>
        <span className="text-meta leading-tight text-fg-tertiary">{purpose}</span>
      </span>
      <span className="font-mono text-ui leading-tight text-fg-secondary">{connection.model ?? "not set"}</span>
      {connection.connected ? (
        <StatusPill tone="ok">Connected</StatusPill>
      ) : connection.required ? (
        <StatusPill tone="warn">Not connected</StatusPill>
      ) : (
        <StatusPill tone="neutral">Optional</StatusPill>
      )}
    </div>
  );
}
