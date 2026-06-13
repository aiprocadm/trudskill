import { XMLParser } from 'fast-xml-parser';

export interface ScormManifest {
  version: '1.2';
  title: string;
  launchHref: string;
}

/**
 * Типизированная ошибка разбора манифеста; code уходит в ScormPackage.error.
 *
 * Примечание: код 'scorm_manifest_missing' бросается ScormService.processPackage
 * (zip без imsmanifest.xml), а не этой функцией — здесь он присутствует только
 * в union для совместимости с ScormPackage.error.
 */
export class ScormManifestError extends Error {
  constructor(
    public readonly code:
      | 'scorm_manifest_invalid'
      | 'scorm_version_unsupported'
      | 'scorm_launch_not_found'
      | 'scorm_manifest_missing',
    message: string
  ) {
    super(message);
  }
}

const first = <T>(v: T | T[] | undefined): T | undefined => (Array.isArray(v) ? v[0] : v);

/**
 * Минимальный разбор imsmanifest.xml (D4 спеки): версия схемы, title организации,
 * launch href первого item с identifierref (+ xml:base ресурса). Multi-SCO — backlog.
 */
export function parseScormManifest(xml: string): ScormManifest {
  let doc: Record<string, unknown>;
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      removeNSPrefix: true
    });
    doc = parser.parse(xml) as Record<string, unknown>;
  } catch {
    throw new ScormManifestError('scorm_manifest_invalid', 'imsmanifest.xml is not valid XML');
  }
  const manifest = doc['manifest'] as Record<string, unknown> | undefined;
  if (!manifest) {
    throw new ScormManifestError('scorm_manifest_invalid', 'No <manifest> root element');
  }

  const metadata = first(manifest['metadata']) as Record<string, unknown> | undefined;
  const schemaVersion = String(metadata?.['schemaversion'] ?? '1.2').trim();
  // Пакеты без schemaversion считаем 1.2; всё, что начинается с "2004"/"CAM" — отказ.
  if (!schemaVersion.startsWith('1.2')) {
    throw new ScormManifestError(
      'scorm_version_unsupported',
      `Unsupported SCORM version: ${schemaVersion} (only 1.2 is supported)`
    );
  }

  const organizations = first(manifest['organizations']) as Record<string, unknown> | undefined;
  // I-3: если organizations[@_default] задан, выбираем organization с совпадающим identifier;
  //      fallback — первая organization (поведение до исправления).
  const defaultId =
    typeof organizations?.['@_default'] === 'string' ? organizations['@_default'] : undefined;
  const orgRaw = organizations?.['organization'];
  const orgList = (Array.isArray(orgRaw) ? orgRaw : orgRaw ? [orgRaw] : []) as Array<
    Record<string, unknown>
  >;
  const organization: Record<string, unknown> | undefined =
    defaultId !== undefined
      ? (orgList.find((o) => o['@_identifier'] === defaultId) ?? orgList[0])
      : orgList[0];
  const title = String(first(organization?.['title']) ?? '').trim() || 'SCORM course';

  // Первый item (возможно вложенный) с identifierref.
  const findItemRef = (node: Record<string, unknown> | undefined): string | undefined => {
    if (!node) return undefined;
    const items = node['item'];
    const list = Array.isArray(items) ? items : items ? [items] : [];
    for (const raw of list) {
      const item = raw as Record<string, unknown>;
      const ref = item['@_identifierref'];
      if (typeof ref === 'string' && ref.length > 0) return ref;
      const nested = findItemRef(item);
      if (nested) return nested;
    }
    return undefined;
  };
  const identifierref = findItemRef(organization);

  const resources = first(manifest['resources']) as Record<string, unknown> | undefined;
  const resourceRaw = resources?.['resource'];
  const resourceList = (
    Array.isArray(resourceRaw) ? resourceRaw : resourceRaw ? [resourceRaw] : []
  ) as Array<Record<string, unknown>>;
  const resource = identifierref
    ? resourceList.find((r) => r['@_identifier'] === identifierref)
    : undefined;
  const href =
    typeof resource?.['@_href'] === 'string' ? (resource['@_href'] as string) : undefined;
  if (!identifierref || !href) {
    throw new ScormManifestError(
      'scorm_launch_not_found',
      'Manifest has no launchable item (organization item with identifierref → resource href)'
    );
  }
  const rawBase = typeof resource?.['@_base'] === 'string' ? (resource['@_base'] as string) : '';
  // M-2: если base непустой и не заканчивается на '/', вставить разделитель
  //      чтобы "content" + "index.html" → "content/index.html" (а не "contentindex.html").
  const base = rawBase.length > 0 && !rawBase.endsWith('/') ? `${rawBase}/` : rawBase;
  return { version: '1.2', title, launchHref: `${base}${href}` };
}
