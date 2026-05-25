'use strict';
const { google } = require('googleapis');
const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');

const STATIC_DIR = path.join(__dirname, 'static');

async function parseAndExportSheets() {
    const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    if (!serviceAccountKey) throw new Error('환경변수 GOOGLE_SERVICE_ACCOUNT_KEY 가 없습니다.');

    const auth = new google.auth.GoogleAuth({
        credentials: JSON.parse(serviceAccountKey),
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    const client    = await auth.getClient();
    const sheetsApi = google.sheets({ version: 'v4', auth: client });

    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
    if (!spreadsheetId) throw new Error('환경변수 GOOGLE_SPREADSHEET_ID 가 없습니다.');

    const meta       = await sheetsApi.spreadsheets.get({ spreadsheetId });
    const sheetNames = meta.data.sheets
        .map(s => s.properties.title)
        .filter(name => !name.startsWith('_'));

    fs.mkdirSync(STATIC_DIR, { recursive: true });

    const manifestSheets = [];

    for (const sheetName of sheetNames) {
        try {
            const result = await parseSheet(sheetsApi, spreadsheetId, sheetName);
            if (!result) continue;

            const payload = { data: result.data };
            const jsonStr = JSON.stringify(payload, null, 2);

            fs.writeFileSync(path.join(STATIC_DIR, `${sheetName}.json`), jsonStr, 'utf-8');

            manifestSheets.push({
                name:    sheetName,
                version: result.version,
                hash:    sha256(jsonStr),
                url:     `/static/${sheetName}.json`,
            });

            console.log(`  [Parser] ${sheetName} v${result.version} (${result.data.length}행)`);
        } catch (err) {
            console.error(`  [Parser] ${sheetName} 실패:`, err.message);
        }
    }

    const manifest = {
        updatedAt: new Date().toISOString(),
        sheets:    manifestSheets,
    };

    fs.writeFileSync(
        path.join(STATIC_DIR, 'manifest.json'),
        JSON.stringify(manifest, null, 2),
        'utf-8'
    );

    console.log('[Parser] manifest.json 생성 완료.');
    return manifest;
}

async function parseSheet(sheetsApi, spreadsheetId, sheetName) {
    const res = await sheetsApi.spreadsheets.values.get({
        spreadsheetId,
        range: sheetName,
        valueRenderOption: 'UNFORMATTED_VALUE',
    });

    const rows = res.data.values;
    if (!rows || rows.length < 2) return null;

    const headerRow = rows[0] || [];

    let lastIdx = headerRow.length - 1;
    while (lastIdx >= 0 && isBlank(headerRow[lastIdx])) lastIdx--;

    if (lastIdx < 0) return null;

    let version     = 1;
    let fieldEndIdx = lastIdx;

    const lastVal = headerRow[lastIdx];
    if (typeof lastVal === 'number' && Number.isInteger(lastVal) && lastVal > 0) {
        version     = lastVal;
        fieldEndIdx = lastIdx - 1;
    } else if (typeof lastVal === 'string') {
        const parsed = parseInt(lastVal.trim(), 10);
        if (!isNaN(parsed) && parsed > 0 && String(parsed) === lastVal.trim()) {
            version     = parsed;
            fieldEndIdx = lastIdx - 1;
        }
    }

    if (fieldEndIdx < 0) return null;

    const validCols = [];
    for (let i = 0; i <= fieldEndIdx; i++) {
        const name = String(headerRow[i] ?? '').trim();
        if (!name || name.startsWith('_')) continue;
        validCols.push({ idx: i, name });
    }

    const data = [];
    for (let r = 1; r < rows.length; r++) {
        const row       = rows[r] || [];
        const firstCell = String(row[0] ?? '').trim();
        if (firstCell.startsWith('_')) continue;

        const obj = {};
        let hasValue = false;

        for (const { idx, name } of validCols) {
            const val = row[idx] !== undefined ? row[idx] : null;
            obj[name] = val;
            if (!isBlank(val)) hasValue = true;
        }

        if (hasValue) data.push(obj);
    }

    return { version, data };
}

function isBlank(v) {
    return v === undefined || v === null || v === '';
}

function sha256(str) {
    return crypto.createHash('sha256').update(str, 'utf-8').digest('hex');
}

parseAndExportSheets().catch(err => {
    console.error('[Parser] 오류:', err.message);
    process.exit(1);
});
