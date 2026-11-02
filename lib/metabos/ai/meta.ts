/** PR #22 model identities. Transport lives in ../inference/providers.ts behind approved leases.
 * Unverified image/voice sketches from the first PR revision are deliberately disabled.
 * https://dev.meta.ai/docs/quickstart
 * https://docs.baseten.co/inference/model-apis/overview
 */
export const META_BASE = 'https://api.meta.ai/v1';
export const BASETEN_BASE = 'https://inference.baseten.co/v1';
export const META_MODELS = { spark: 'muse-spark-1.3', wonder: 'muse-wonder-1.0', image: 'muse-image-1.0', transcribe: 'muse-voice-transcribe-1.0', sam: 'sam-3.1' } as const;
export const BASETEN_MUSE_SPARK_OPEN = 'meta-models/muse-spark-open-1026';
type Env = Record<string, string | undefined>;
export const metaKey = (env: Env = process.env) => (env.META_MODEL_API_KEY || env.MODEL_API_KEY)?.trim() || null;
export const basetenKey = (env: Env = process.env) => env.BASETEN_API_KEY?.trim() || null;
export async function metaImage(..._args: unknown[]): Promise<never> { throw new Error('Muse Image is not qualified or connected to Jev; no request sent'); }
export async function metaTranscribe(..._args: unknown[]): Promise<never> { throw new Error('Muse Voice is not qualified or connected to Jev; no request sent'); }
