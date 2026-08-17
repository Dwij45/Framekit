export function jobTypeLabel(type: string): string {
  switch (type) {
    case "ingest_transcode":
      return "Upload";
    case "transform":
      return "Edit";
    case "compose":
      return "Timeline";
    default:
      return type;
  }
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
