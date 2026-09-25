"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DeleteAssetButton } from "@/components/delete-asset-button";
import { StatusPill } from "@/components/status-pill";
import { videoTitle } from "@/lib/labels";

export type LibraryItem = {
  id: string;
  fileName: string;
  status: string;
  durationSec: number;
  width: number | null;
  height: number | null;
  poster: string | null;
  downloadUrl: string | null;
  downloadLabel: string | null;
};

const STORAGE_KEY = "framekit.videoView";

export function VideoLibrary({ items }: { items: LibraryItem[] }) {
  const [view, setView] = useState<"tiles" | "details">("tiles");

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "tiles" || saved === "details") setView(saved);
  }, []);

  function choose(next: "tiles" | "details") {
    setView(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }

  return (
    <div className="library">
      <div className="view-toggle" role="group" aria-label="Video layout">
        <button
          type="button"
          className={view === "tiles" ? "is-on" : undefined}
          aria-pressed={view === "tiles"}
          onClick={() => choose("tiles")}
        >
          Tiles
        </button>
        <button
          type="button"
          className={view === "details" ? "is-on" : undefined}
          aria-pressed={view === "details"}
          onClick={() => choose("details")}
        >
          Details
        </button>
      </div>
      {view === "tiles" ? (
        <ul className="video-tiles">
          {items.map((item) => (
            <Tile key={item.id} item={item} />
          ))}
        </ul>
      ) : (
        <ul className="video-rows">
          {items.map((item) => (
            <Row key={item.id} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}

function meta(item: LibraryItem) {
  const named = videoTitle(item.fileName);
  const size =
    item.width && item.height ? `${item.width}×${item.height}` : null;
  const time = item.durationSec > 0 ? `${item.durationSec.toFixed(0)}s` : null;
  return { ...named, size, time };
}

function Tile({ item }: { item: LibraryItem }) {
  const { title, kind, size, time } = meta(item);
  return (
    <li className="video-tile">
      <Link href={`/assets/${item.id}`} className="video-tile-link">
        <span className="video-thumb">
          {item.poster ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.poster} alt="" />
          ) : (
            <span className="video-thumb-empty">No frame yet</span>
          )}
          {time ? <span className="video-dur">{time}</span> : null}
        </span>
        <span className="video-tile-copy">
          <span className="video-name">{title}</span>
          {kind ? <span className="video-kind">{kind}</span> : null}
          <span className="video-meta">
            <StatusPill status={item.status} />
            {size ? <span>{size}</span> : null}
          </span>
        </span>
      </Link>
      <span className="video-actions" onClick={(e) => e.stopPropagation()}>
        {item.downloadUrl ? (
          <a className="btn-ghost" href={`${item.downloadUrl}?download=1`}>
            Download{item.downloadLabel ? ` ${item.downloadLabel}` : ""}
          </a>
        ) : null}
        <DeleteAssetButton assetId={item.id} />
      </span>
    </li>
  );
}

function Row({ item }: { item: LibraryItem }) {
  const { title, kind, size, time } = meta(item);
  return (
    <li className="video-row">
      <Link href={`/assets/${item.id}`} className="video-row-link">
        <span className="video-thumb video-thumb-sm">
          {item.poster ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.poster} alt="" />
          ) : (
            <span className="video-thumb-empty">—</span>
          )}
        </span>
        <span className="video-tile-copy">
          <span className="video-name">{title}</span>
          {kind ? <span className="video-kind">{kind}</span> : null}
          <span className="video-meta">
            <StatusPill status={item.status} />
            {time ? <span>{time}</span> : null}
            {size ? <span>{size}</span> : null}
          </span>
        </span>
      </Link>
      <span className="video-actions">
        {item.downloadUrl ? (
          <a className="btn-ghost" href={`${item.downloadUrl}?download=1`}>
            Download{item.downloadLabel ? ` ${item.downloadLabel}` : ""}
          </a>
        ) : null}
        <DeleteAssetButton assetId={item.id} />
      </span>
    </li>
  );
}
