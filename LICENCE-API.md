# IMPULSE License System

Sistem licenciranja za projekte kreirane kroz IMPULSE Dashboard. Omogućava izdavanje, verifikaciju i upravljanje licencama za klijentske projekte.

## Format ključa

```
IMP-XXXX-XXXX-XXXX
```

Karakteri: A-Z (bez I, O), 2-9. Generisan server-side, jedinstven po licenci.

## Planovi

| Plan | Trajanje | Vrednost |
|------|----------|----------|
| `monthly` | 30 dana | Mesečna licenca |
| `yearly` | 365 dana | Godišnja licenca |

## Statusne vrednosti

| Status | Opis |
|--------|------|
| `active` | Licenca je aktivna i validna |
| `expired` | Istekla (automatski se markira pri verifikaciji) |
| `suspended` | Ručno suspendovana od strane admina |

## API Endpointi

### POST /api/license/verify

Verifikuje licencni ključ. Javni endpoint (bez auth-a).

**URL:** `https://app.impulsee.dev/api/license/verify`

**Request:**
```json
{
  "key": "IMP-A2B3-C4D5-E6F7"
}
```

**Response (validna):**
```json
{
  "valid": true,
  "plan": "monthly",
  "expiresAt": "2026-04-04T12:00:00.000Z",
  "daysLeft": 30
}
```

**Response (nevalidna):**
```json
{
  "valid": false,
  "reason": "expired"
}
```

Mogući `reason` vrednosti: `missing_key`, `invalid`, `expired`, `suspended`.

### GET /api/license/check/:key

Brza provera validnosti licence (true/false). Javni endpoint.

**URL:** `https://app.impulsee.dev/api/license/check/IMP-A2B3-C4D5-E6F7`

**Response:**
```json
{
  "valid": true
}
```

## Integracija u projekat

### 1. Environment varijabla

Dodaj u `.env` fajl projekta:

```env
IMPULSE_LICENSE_KEY=IMP-XXXX-XXXX-XXXX
```

### 2. Verifikacija na startu (Node.js primer)

```js
async function verifyLicense() {
  const key = process.env.IMPULSE_LICENSE_KEY;
  if (!key) {
    console.warn('IMPULSE_LICENSE_KEY nije postavljen');
    return false;
  }

  try {
    const res = await fetch('https://app.impulsee.dev/api/license/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
    });
    const data = await res.json();

    if (!data.valid) {
      console.error(`Licenca nije validna: ${data.reason}`);
      return false;
    }

    console.log(`Licenca aktivna, ističe za ${data.daysLeft} dana`);
    return true;
  } catch (err) {
    // Offline fallback - dozvoli rad ako server nije dostupan
    console.warn('Verifikacija licence nije uspela (offline mode)');
    return true;
  }
}
```

### 3. Express middleware primer

```js
async function requireLicense(req, res, next) {
  const key = process.env.IMPULSE_LICENSE_KEY;
  if (!key) return res.status(403).json({ error: 'Licenca nije konfigurisana' });

  try {
    const r = await fetch('https://app.impulsee.dev/api/license/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
    });
    const data = await r.json();
    if (!data.valid) return res.status(403).json({ error: 'Licenca nije validna', reason: data.reason });
    next();
  } catch {
    // Offline fallback
    next();
  }
}

// Primena na admin rute
app.use('/admin', requireLicense);
```

## Upravljanje licencama

Licence se kreiraju i upravljaju kroz IMPULSE Dev (lokalna aplikacija):

- **Kreiranje:** Command Center > Licenca tab > Nova licenca
- **Suspenzija:** Promeni status na "suspended"
- **Obnova:** Klik na "Obnovi" dugme (produžava za 30/365 dana od danas)
- **Brisanje:** Trajno uklanja licencu

Sve promene se automatski sinhronizuju sa web aplikacijom (`app.impulsee.dev`).
