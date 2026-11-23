import type { Asset, AssetCategory, Deck, DeckMeta, El, Example, ExamplePage, Profile, Slide, Template, TemplateCategory } from "../types";

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

export interface NewExample {
  /** Identifiant choisi avant l'envoi des fichiers (il sert de dossier). */
  id: string;
  title: string;
  author: string;
  description: string;
  pages: ExamplePage[];
  pdfUrl: string | null;
}

export type ExamplePatch = Partial<Pick<Example, "title" | "author" | "description" | "pages" | "pdfUrl">>;

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
  readonly mode: "supabase" | "local" | "guest";

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
  /** Noms donnés par le staff aux éléments et modèles du pack de départ (identifiant → nom). */
  listBuiltinNames(): Promise<Record<string, string>>;
  /** `null` rend son nom d'origine à l'élément. */
  setBuiltinName(id: string, name: string | null): Promise<void>;

  /** `library` : image de bibliothèque (staff). `user` : image d'une présentation. */
  uploadImage(file: Blob, scope: "library" | "user"): Promise<UploadResult>;

  /** Exemples : lecture pour tous, écriture réservée au staff. Du plus récent au plus ancien. */
  listExamples(): Promise<Example[]>;
  /** Range un fichier d'exemple (page, miniature, PDF d'origine) et renvoie son adresse. */
  uploadExampleFile(exampleId: string, name: string, file: Blob): Promise<string>;
  createExample(input: NewExample): Promise<Example>;
  updateExample(id: string, patch: ExamplePatch): Promise<void>;
  /** Supprime l'exemple et ses fichiers (sans erreur si l'exemple n'existe déjà plus). */
  deleteExample(id: string): Promise<void>;
  /** Supprime des fichiers d'un exemple (pages retirées), désignés par leur adresse. */
  deleteExampleFiles(exampleId: string, urls: string[]): Promise<void>;

  /** Note que la visite guidée a été proposée : elle ne se relancera plus d'elle-même. */
  markOnboarded(): Promise<void>;
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
