# Configuration Netlify Identity — AkilAI Dashboard

## 1. Activer Netlify Identity

1. Aller dans **Netlify → ton site → Integrations → Identity**
2. Cliquer sur **Enable Identity**
3. Sous **Registration** → choisir **Invite only**
   _(les clients ne peuvent pas s'inscrire eux-mêmes, uniquement sur invitation)_

---

## 2. Inviter un client

1. Dans Netlify → **Identity → Invite users**
2. Entrer l'adresse email du client → **Send invite**
3. Le client reçoit un email avec un lien pour définir son mot de passe
4. Le dashboard intercepte automatiquement le token d'invitation dans l'URL et ouvre le widget

---

## 3. Associer le ClientId Airtable à l'utilisateur

Après avoir invité le client, il faut lier son compte Netlify Identity à son enregistrement Airtable.

1. Dans Netlify → **Identity → cliquer sur l'utilisateur**
2. Cliquer sur **Edit metadata** (ou "Set metadata")
3. Ajouter dans le champ `app_metadata` :

```json
{
  "airtable_client_id": "recXXXXXXXXXX"
}
```

> `recXXXXXXXXXX` est l'ID Airtable de l'enregistrement du client dans la table **Clients**.  
> Pour le trouver : Airtable → table Clients → ouvrir la fiche → l'URL contient `rec...`

**Exemple complet :**
```json
{
  "airtable_client_id": "recAbc123XyZ456"
}
```

---

## 4. Variables d'environnement requises

Dans Netlify → **Site settings → Environment variables**, configurer :

| Variable | Description |
|---|---|
| `AIRTABLE_API_KEY` | Clé API Airtable (depuis airtable.com → Account → API) |
| `AIRTABLE_BASE_ID` | ID de votre base Airtable (visible dans l'URL Airtable, commence par "app") |
| `RESEND_API_KEY` | Clé API Resend (depuis resend.com) |
| `ADMIN_EMAIL` | Email de l'administrateur AkilAI pour les alertes |
| `MAKE_API_KEY` | Clé API Make (depuis Make → Account → API) |
| `VAPI_API_KEY` | Clé API Vapi (depuis dashboard.vapi.ai → Account) |
| `ELEVENLABS_API_KEY` | Clé API ElevenLabs (depuis elevenlabs.io → Profile → API key) |

> `URL` est automatiquement fournie par Netlify — ne pas la définir manuellement.  
> `VAPI_ASSISTANT_ID` n'est plus utilisé — chaque client a son propre ID dans le champ `VapiAssistantId` de la table Clients.

---

## 5. Champ Airtable à ajouter

Dans la table **Clients** d'Airtable, ajouter un champ :

| Nom du champ | Type | Description |
|---|---|---|
| `VapiAssistantId` | Single line text | ID de l'assistant Vapi créé pour ce client |

---

## 6. Flux complet pour un nouveau client

```
1. Créer l'enregistrement dans Airtable (table Clients) → noter le recXXX
2. Dans Netlify Identity → Invite users → envoyer l'invitation
3. Dans Netlify Identity → cliquer sur l'utilisateur → Edit metadata
   → ajouter { "airtable_client_id": "recXXX" }
4. Le client clique sur le lien d'invitation → définit son mot de passe
5. Le client se connecte → voit uniquement ses propres données
```

---

## 7. Sécurité

- **JWT vérifié automatiquement** par Netlify sur chaque requête vers les Netlify Functions
- **Isolation des données** : chaque fonction filtre Airtable avec `{ClientId}="{airtable_client_id}"`
- **Aucune clé API** dans `index.html` — toutes les clés sont côté serveur (Netlify Functions)
- **Token JWT** stocké en mémoire uniquement (jamais en `localStorage`)
- **Registration "Invite only"** : impossible de créer un compte sans invitation explicite
