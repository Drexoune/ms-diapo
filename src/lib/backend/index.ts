import type { DataApi } from "./api";
import { localApi } from "./local";
import { supabaseApi, supabaseConfigured } from "./supabase";

/** Supabase dès qu'il est configuré ; sinon stockage local (développement). */
export const data: DataApi = supabaseConfigured ? supabaseApi : localApi;

export { DataError } from "./api";
export type { DataApi, NewAsset, NewTemplate, UploadResult } from "./api";
