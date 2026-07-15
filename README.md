# 🔗 LinkVault – Smart Resource Manager

A Chrome extension to save links, PDFs, and documents in organised categories with **AI-powered plain-language summaries**.

---

## ✨ Features

| Feature | Details |
|---|---|
| **6 Categories** | 📚 Studies · 👤 Personal · 🛍️ Shopping · 🎓 College · 📋 PM Tasks · 📄 Important Docs |
| **Save anything** | URLs, PDFs, DOCX, TXT, Markdown files |
| **AI Summaries** | Covers every key point in simple language via OpenAI or Google Gemini |
| **Quick-save tab** | One-click banner to save the current browser tab |
| **Search** | Full-text search across titles, URLs, summaries, notes |
| **Regenerate** | Re-run AI summary any time from the detail view |
| **Export / Import** | JSON backup so your data is always portable |

---

## 🚀 Installation (Developer Mode)

1. Clone or download this folder.
2. Open Chrome → `chrome://extensions`
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked** → select this `link-vault-extension/` folder.
5. The 🔗 icon appears in your toolbar. Pin it for easy access.

---

## 🤖 Setting Up AI Summaries

Open the extension popup → click **⚙️ Settings**.

### Option A — Groq (Free & Fast, recommended)
1. Go to [console.groq.com/keys](https://console.groq.com/keys)
2. Create a new API key.
3. Paste it in Settings, choose **Groq**, pick a model (Llama 3.3 70B recommended), click **Save Settings**.
4. **Cost**: Generous free tier, very fast inference.

### Option B — OpenAI (GPT)
1. Go to [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Create a new secret key.
3. Paste it in Settings, choose your model, click **Save Settings**.
4. **Cost**: GPT-3.5 Turbo ≈ $0.002 per summary (very cheap).

### Option C — Google Gemini (free tier available)
1. Go to [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
2. Click **Create API key**.
3. Paste it in Settings, select **Google Gemini**, click **Save Settings**.
4. **Cost**: Gemini 1.5 Flash has a generous free quota.

> Your API key is stored only in `chrome.storage.local` on your device.  
> It is sent **only** to the AI provider you choose, nowhere else.

---

## 📖 How to Use

### Saving a link
- Click **+** (or the ⬆️ button to save the current tab automatically).
- Paste the URL → click **Fetch** to auto-fill the title.
- Choose a category, add optional notes.
- Leave **Generate AI Summary** on → click **Save Resource**.

### Uploading a file (PDF / DOC / TXT / MD)
- Click **+** → switch to the **File / PDF** tab.
- Drag & drop or click to select your file.
- Text-based PDFs are parsed automatically for AI summarisation.
- Choose a category → **Save Resource**.

### Viewing & managing
- Click any card to open the detail view.
- Use **↻ Regenerate** to refresh the AI summary at any time.
- Use **↗️ Open Link** to open the URL in a new tab.
- **Delete** is a two-step confirmation (click once to confirm, again to delete).

### Search
- Click 🔍 in the header and type anything — searches titles, URLs, summaries, and notes.

---

## 📁 Project Structure

```
link-vault-extension/
├── manifest.json       # MV3 extension manifest
├── popup.html          # Main extension UI
├── popup.css           # Popup styles (dark theme)
├── popup.js            # Popup logic (state, rendering, file parsing)
├── background.js       # Service worker (URL fetch, AI API calls)
├── options.html        # Settings page
├── options.css         # Settings styles
├── options.js          # Settings logic (save/export/import)
└── README.md           # This file
```

---

## 🔒 Privacy & Security

- No data leaves your device except the content you choose to summarise via the AI API.
- All resources are stored in `chrome.storage.local` (device-only).
- The API key is never logged or transmitted anywhere other than directly to the chosen AI provider.
- HTTPS is enforced for all external requests.

---

## 🛠 Supported File Types

| Extension | AI Summary |
|---|---|
| `.txt` `.md` | ✅ Full text extracted |
| `.pdf` | ✅ Text-based PDFs extracted automatically (uploaded files or direct PDF URLs) |
| `.doc` `.docx` | ⚠️ Filename + user notes used for summary |

> For complex/scanned PDFs, add context in the **Notes** field to improve the AI summary.

---

## 🗺 Roadmap

- [ ] Tags / custom labels
- [ ] Pinned / starred resources
- [ ] Bulk import from browser bookmarks
- [ ] Cloud sync (optional)
- [ ] PDF.js integration for scanned PDFs
