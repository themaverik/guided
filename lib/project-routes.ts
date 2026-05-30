/* Client-safe URL builders for the per-project API + asset routes (no fs). */

export const assetBaseFor = (slug: string) => `/api/projects/${slug}/assets`;
export const bookApiFor = (slug: string) => `/api/projects/${slug}/book`;
export const uploadApiFor = (slug: string) => `/api/projects/${slug}/upload`;
export const imagesApiFor = (slug: string) => `/api/projects/${slug}/images`;

/** Full URL for a stored asset. */
export const assetUrl = (slug: string, chapterId: string, file: string) =>
  `${assetBaseFor(slug)}/${chapterId}/${file}`;
