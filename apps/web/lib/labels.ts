export function jobTypeLabel(type: string): string {
  switch (type) {
    case "ingest_transcode":
      return "Upload";
    case "transform":
      return "Edit";
    case "compose":
      return "Timeline";
    case "caption":
      return "Captions";
    default:
      return type;
  }
}

export function videoTitle(fileName: string): { title: string; kind: string | null } {
  const base = fileName.replace(/\.[a-z0-9]+$/i, "");
  const match = base.match(/^(.*) \((.+)\)$/);
  if (match) {
    return { title: match[1].replaceAll("_", " "), kind: match[2] };
  }
  return { title: base.replaceAll("_", " "), kind: null };
}

export function statusLabel(status: string): string {
  switch (status) {
    case "uploading":
      return "Uploading";
    case "queued":
      return "Queued";
    case "probing":
      return "Inspecting";
    case "encoding":
      return "Encoding";
    case "packaging":
      return "Packaging";
    case "ready":
      return "Ready";
    case "failed":
      return "Failed";
    case "canceled":
      return "Canceled";
    default:
      return status;
  }
}
