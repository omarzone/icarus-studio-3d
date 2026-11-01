// PNL-LIBRARY
import { useState } from "react";
import type { LibraryShelf } from "../../../ports/library-port.ts";
import { Panel, PanelTab } from "../../../ui/panel.tsx";
import { CommunityTab } from "./community-tab.tsx";
import { LibraryTab } from "./library-tab.tsx";
import { MyFilesTab } from "./my-files-tab.tsx";

export type LibraryPanelProps = {
  // Scene key of the project the pieces are suggested for (library port).
  scene: string;
  // Label of the dashed import card ("Import environment .glb .fbx .usd").
  importLabel: string;
  className?: string;
};

const SHELVES: readonly { id: LibraryShelf; label: string }[] = [
  { id: "library", label: "Library" },
  { id: "community", label: "Community" },
  { id: "my-files", label: "My files" },
];

export function LibraryPanel({ scene, importLabel, className = "h-42 shrink-0" }: LibraryPanelProps) {
  const [shelf, setShelf] = useState<LibraryShelf>("library");
  const [search, setSearch] = useState("");
  return (
    <Panel
      id="PNL-LIBRARY"
      className={className}
      tabs={SHELVES.map((item) => (
        <PanelTab key={item.id} label={item.label} active={item.id === shelf} onSelect={() => setShelf(item.id)} />
      ))}
      options={
        <input
          type="search"
          aria-label="Search assets"
          placeholder="Search assets"
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
          className="h-6.5 w-32 rounded-control bg-transparent px-0 text-right text-ui outline-none placeholder:text-fg-tertiary hover:bg-fill-hover focus:bg-control focus:text-left"
        />
      }
    >
      <ShelfView shelf={shelf} scene={scene} search={search} importLabel={importLabel} />
    </Panel>
  );
}

function ShelfView({ shelf, ...props }: { shelf: LibraryShelf; scene: string; search: string; importLabel: string }) {
  switch (shelf) {
    case "library":
      return <LibraryTab {...props} />;
    case "community":
      return <CommunityTab scene={props.scene} search={props.search} />;
    case "my-files":
      return <MyFilesTab {...props} />;
  }
}
