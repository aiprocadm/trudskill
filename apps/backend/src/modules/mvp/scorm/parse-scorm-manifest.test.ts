import { describe, expect, it } from 'vitest';

import { parseScormManifest } from './parse-scorm-manifest.js';

const MANIFEST_12 = `<?xml version="1.0"?>
<manifest identifier="m1" xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2">
  <metadata><schema>ADL SCORM</schema><schemaversion>1.2</schemaversion></metadata>
  <organizations default="org1">
    <organization identifier="org1">
      <title>Охрана труда — вводный</title>
      <item identifier="i1" identifierref="res1"><title>Урок 1</title></item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="res1" type="webcontent" adlcp:scormtype="sco" href="content/index.html" xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2">
      <file href="content/index.html"/>
    </resource>
  </resources>
</manifest>`;

describe('parseScormManifest', () => {
  it('извлекает версию, title и launch href первого item→resource', () => {
    const m = parseScormManifest(MANIFEST_12);
    expect(m).toEqual({
      version: '1.2',
      title: 'Охрана труда — вводный',
      launchHref: 'content/index.html'
    });
  });

  it('учитывает xml:base ресурса', () => {
    const xml = MANIFEST_12.replace(
      'href="content/index.html"',
      'href="index.html" xml:base="content/"'
    );
    expect(parseScormManifest(xml).launchHref).toBe('content/index.html');
  });

  it('SCORM 2004 → ScormManifestError(scorm_version_unsupported)', () => {
    const xml = MANIFEST_12.replace(
      '<schemaversion>1.2</schemaversion>',
      '<schemaversion>2004 4th Edition</schemaversion>'
    );
    expect(() => parseScormManifest(xml)).toThrowError(
      expect.objectContaining({ code: 'scorm_version_unsupported' })
    );
  });

  it('нет organizations/item с identifierref → scorm_launch_not_found', () => {
    const xml = MANIFEST_12.replace(' identifierref="res1"', '');
    expect(() => parseScormManifest(xml)).toThrowError(
      expect.objectContaining({ code: 'scorm_launch_not_found' })
    );
  });

  it('битый XML → scorm_manifest_invalid', () => {
    expect(() => parseScormManifest('<manifest><broken')).toThrowError(
      expect.objectContaining({ code: 'scorm_manifest_invalid' })
    );
  });

  it('отсутствие schemaversion трактуется как 1.2 (многие пакеты его не пишут)', () => {
    const xml = MANIFEST_12.replace(
      '<metadata><schema>ADL SCORM</schema><schemaversion>1.2</schemaversion></metadata>',
      ''
    );
    expect(parseScormManifest(xml).version).toBe('1.2');
  });
});
