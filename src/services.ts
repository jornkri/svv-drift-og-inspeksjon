import type { AppConfig } from "./config.ts";
import type { DataService } from "./data/DataService.ts";

/** Tjenester som settes opp ved oppstart og brukes av komponentene. */
export interface Services {
  cfg: AppConfig;
  data: DataService;
  /** Geodata Online-token (mock/dev), eller null når det mangler */
  gdoToken: string | null;
}

let current: Services | null = null;

export function setServices(s: Services): void {
  current = s;
}

export function services(): Services {
  if (!current) throw new Error("Tjenestene er ikke initiert");
  return current;
}
