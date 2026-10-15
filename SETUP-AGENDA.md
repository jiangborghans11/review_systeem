# Agenda + contactformulier koppelen (eenmalig, ~10 min)

De planner op `/website` leest je vrije tijden uit Google Agenda en zet afspraken er direct in.
Het contactformulier mailt naar je Gmail. Daarvoor heeft de site eenmalig toestemming nodig van
**socialwaveagency.nl@gmail.com**. Doe alles hieronder ingelogd met dát account.

## 1. Google Cloud project (5 min)

1. Ga naar https://console.cloud.google.com/projectcreate en maak project **Social Wave Website**.
2. Zet twee API's aan (klik op elk, dan **Enable**):
   - https://console.cloud.google.com/apis/library/calendar-json.googleapis.com
   - https://console.cloud.google.com/apis/library/gmail.googleapis.com
3. Ga naar https://console.cloud.google.com/auth/overview en klik **Get started**:
   - App name: `Social Wave Website`, support e-mail: je eigen adres
   - Audience: **External**
   - Contact e-mail: je eigen adres → **Create**
4. Ga naar **Audience** (links) en klik **Publish app** → bevestig.
   Belangrijk: zonder deze stap stopt de koppeling na 7 dagen.
5. Ga naar **Clients** → **Create client**:
   - Application type: **Web application**
   - Name: `Website`
   - Authorized redirect URIs → **Add URI**: `https://developers.google.com/oauthplayground`
   - **Create**. Kopieer de **Client ID** en **Client secret**.

## 2. Refresh token ophalen (2 min)

1. Open https://developers.google.com/oauthplayground
2. Klik rechtsboven op het tandwiel → vink **Use your own OAuth credentials** aan → plak Client ID en Client secret.
3. Plak links bij "Input your own scopes" deze regel:
   ```
   https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.freebusy https://www.googleapis.com/auth/gmail.send
   ```
4. **Authorize APIs** → kies socialwaveagency.nl@gmail.com.
   Zie je "Google hasn't verified this app": klik **Advanced** → **Go to Social Wave Website** → alles toestaan.
   (Normaal: het is je eigen app.)
5. Klik **Exchange authorization code for tokens** en kopieer de **Refresh token**.

## 3. In Vercel zetten (2 min)

Project **social-wave-website** → **Settings** → **Environment Variables**. Voeg toe (Production + Preview):

| Naam | Waarde |
|---|---|
| `GOOGLE_CLIENT_ID` | Client ID uit stap 1 |
| `GOOGLE_CLIENT_SECRET` | Client secret uit stap 1 |
| `GOOGLE_REFRESH_TOKEN` | Refresh token uit stap 2 |

Optioneel: `NOTIFY_EMAIL` als formulieren naar een ander adres moeten (standaard socialwaveagency.nl@gmail.com).

Daarna opnieuw deployen (variabelen gelden pas voor een nieuwe deploy).

## 4. Testen

- Open `https://socialwave-agency.nl/api/slots` → je ziet een lijst met dagen en tijden.
- Plan op `/website` een testafspraak met een ander e-mailadres. Die staat dan in je agenda, de gast krijgt een uitnodiging en jij een mail.

## Regels aanpassen

In `api/_google.js` bovenaan:

- `duration` — lengte gesprek (15)
- `dayStart` / `dayEnd` — 9:00 tot 18:00
- `weekdays` — ma t/m vr
- `minNoticeMin` — minimaal 3 uur van tevoren
- `horizonDays` — 4 weken vooruit
- `bufferMin` — vrije minuten rond andere afspraken (0)

Bezette tijden in je agenda en Nederlandse feestdagen worden automatisch overgeslagen.
