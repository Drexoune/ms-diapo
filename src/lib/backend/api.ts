import type { Asset, AssetCategory, Deck, DeckMeta, El, Profile, Slide, Template, TemplateCategory } from "../types";

export interface NewAsset {
  category: AssetCategory;
  name: string;
  tags: string[];
  kind: "image" | "elements";
  url?: string | null;
  width?: number | null;
  height?: number | null;
  elements?: El[] | null;
}

export interface NewTemplate {
  kind: "slide" | "deck";
  name: string;
  category: TemplateCategory;
  slides: Slide[];
}

export interface UploadResult {
  url: string;
  width: number;
  height: number;
}

/**
 * Accès aux données. Deux implémentations :
 *  - Supabase (production) : comptes Discord, base Postgres, stockage ;
 *  - locale (développement, quand Supabase n'est pas configuré) : tout
 *    reste dans le navigateur.
 * L'interface de l'application ne connaît que ce contrat.
 */
export interface DataApi {
  readonly mode: "supabase" | "local";

  getProfile(): Promise<Profile | null>;
  /** Prévient quand la session change (connexion, déconnexion). Renvoie la fonction de désabonnement. */
  onAuthChange(cb: () => void): () => void;
  signIn(): Promise<void>;
  signOut(): Promise<void>;

  listDecks(): Promise<DeckMeta[]>;
  getDeck(id: string): Promise<Deck | null>;
  createDeck(input: { title: string; slides: Slide[] }): Promise<Deck>;
  saveDeck(id: string, patch: { title: string; slides: Slide[] }): Promise<void>;
  deleteDeck(id: string): Promise<void>;

  /** Éléments ajoutés par le staff (le pack de départ est fourni par l'application). */
  listAssets(): Promise<Asset[]>;
  createAsset(input: NewAsset): Promise<Asset>;
  updateAsset(id: string, patch: Partial<Pick<Asset, "name" | "category" | "tags">>): Promise<void>;
  deleteAsset(id: string): Promise<void>;

  listTemplates(): Promise<Template[]>;
  getTemplate(id: string): Promise<Template | null>;
  createTemplate(input: NewTemplate): Promise<Template>;
  updateTemplate(id: string, patch: Partial<Pick<Template, "name" | "category" | "slides">>): Promise<void>;
  deleteTemplate(id: string): Promise<void>;

  /** Identifiants des éléments du pack de départ masqués par le staff. */
  listHidden(): Promise<string[]>;
  setHidden(id: string, hidden: boolean): Promise<void>;

  /** `library` : image de bibliothèque (staff). `user` : image d'une présentation. */
  uploadImage(file: Blob, scope: "library" | "user"): Promise<UploadResult>;
}

export class DataError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "DataError";
  }
}
