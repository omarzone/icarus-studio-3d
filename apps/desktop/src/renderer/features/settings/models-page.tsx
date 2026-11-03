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
import { modelSettingsRequest } from "./model-settings-form.ts";
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
  const [names, setNames] = useState<Partial<Record<ModelCapability, string>>>(() =>
    Object.fromEntries(models.connections.map((connection) => [connection.capability, connection.model ?? ""])),
  );
  const [windows, setWindows] = useState<Partial<Record<ModelCapability, string>>>(() =>
    Object.fromEntries(
      models.connections.map((connection) => [connection.capability, connection.contextTokens?.toString() ?? ""]),
    ),
  );
  // Shown after Test saved a new address without a key, since the engine then has no key to test with.
  const [keyNeeded, setKeyNeeded] = useState(false);
  const request = modelSettingsRequest(models, { endpoint, apiKey, names, windows });
  const blocked = request.invalidWindows.length > 0;
  // Save also leaves the page, so the result is handled on the promise; per-call callbacks would not run.
  const refresh = () => client.invalidateQueries({ queryKey: ["settings", "models"] });
  const test = useEngineAction(settings.testModelConnection);
  const save = useEngineAction(settings.saveModelSettings);
  return (
    <>
      {models.connections.map((connection) => (
        <ConnectionRow
          key={connection.capability}
          connection={connection}
          name={names[connection.capability] ?? ""}
          onName={(name) => setNames({ ...names, [connection.capability]: name })}
          tokens={windows[connection.capability] ?? ""}
          windowInvalid={request.invalidWindows.includes(connection.capability)}
          onWindow={(tokens) => setWindows({ ...windows, [connection.capability]: tokens })}
        />
      ))}
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Endpoint" mono value={endpoint} onChange={(event) => setEndpoint(event.target.value)} />
        <div className="flex flex-col gap-1.5">
          <TextField
            label="API key"
            mono
            type="password"
            autoComplete="off"
            value={apiKey}
            placeholder={models.apiKeyHint ? `•••••••••••••••• ${models.apiKeyHint}` : "not set"}
            onChange={(event) => {
              setApiKey(event.target.value);
              setKeyNeeded(false);
            }}
          />
          {request.keyRequired ? (
            <p className="text-meta leading-tight text-fg-tertiary">
              Changing the address clears the saved key; enter the key for the new address
            </p>
          ) : keyNeeded ? (
            <p role="alert" className="text-meta leading-tight text-warn">
              Saved. Enter the key for the new address, then test the connection
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex gap-2">
        <Act
          cta="Test connection"
          disabled={blocked}
          onClick={() => {
            const { input, keyRequired } = request;
            void save
              .mutateAsync(input)
              .then(() => {
                setKeyNeeded(keyRequired);
                return keyRequired ? undefined : test.mutateAsync(undefined);
              })
              .then(refresh, refresh);
          }}
          className={buttonClass("secondary", "h-8.5 px-4 text-body")}
        >
          Test connection
        </Act>
        <GoTo
          to="SCR-HOME"
          cta="Save"
          disabled={blocked}
          onClick={() => {
            void save.mutateAsync(request.input).then(refresh, () => undefined);
          }}
          className={buttonClass("primary", "h-8.5 text-body")}
        >
          Save
        </GoTo>
      </div>
    </>
  );
}

type RowProps = {
  connection: ModelConnection;
  name: string;
  onName: (name: string) => void;
  tokens: string;
  windowInvalid: boolean;
  onWindow: (tokens: string) => void;
};

function ConnectionRow({ connection, name, onName, tokens, windowInvalid, onWindow }: RowProps) {
  const { label, purpose } = CAPABILITIES[connection.capability];
  return (
    <div className="grid grid-cols-[150px_minmax(0,1fr)_150px_auto] items-center gap-3 rounded-card-sm bg-control px-3.5 py-3">
      <span className="flex flex-col">
        <span className="leading-tight font-semibold">{label}</span>
        <span className="text-meta leading-tight text-fg-tertiary">{purpose}</span>
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <input
          type="text"
          aria-label={`${label} model`}
          placeholder="not set"
          spellCheck={false}
          value={name}
          onChange={(event) => onName(event.target.value)}
          className="-mx-1 rounded-control bg-transparent px-1 font-mono text-ui leading-tight text-fg-secondary outline-none placeholder:text-fg-secondary hover:bg-fill-hover focus:bg-control-raised focus:text-fg"
        />
        {connection.detail && !connection.connected ? (
          <span className="text-meta leading-tight text-warn">{connection.detail}</span>
        ) : null}
      </span>
      <label className="flex min-w-0 flex-col gap-0.5">
        <span className="text-meta leading-tight text-fg-tertiary">Context window (tokens)</span>
        <input
          type="text"
          inputMode="numeric"
          data-cta={`${connection.capability}-context-window`}
          aria-label={`${label} context window in tokens`}
          aria-invalid={windowInvalid}
          placeholder="auto"
          spellCheck={false}
          value={tokens}
          onChange={(event) => onWindow(event.target.value)}
          className="-mx-1 rounded-control bg-transparent px-1 font-mono text-ui leading-tight text-fg-secondary outline-none placeholder:text-fg-tertiary hover:bg-fill-hover focus:bg-control-raised focus:text-fg"
        />
        {windowInvalid ? (
          <span role="alert" className="text-meta leading-tight text-warn">
            4,000 to 10,000,000, or empty
          </span>
        ) : null}
      </label>
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
