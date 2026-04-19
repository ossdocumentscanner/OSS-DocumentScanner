---
id: google-wallet
title: Google Wallet Link Support
sidebar_label: Google Wallet Links
sidebar_position: 5
---

# Google Wallet Link Support

OSS CardWallet can import passes from **Google Wallet "Save to Wallet" links** — the URLs of the form `https://pay.google.com/gp/v/save/…` that are typically found in confirmation emails, ticketing websites, and QR codes.

## What is a Google Wallet Link?

When a transit operator, airline, or event organiser wants to offer a digital pass they generate a URL like:

```
https://pay.google.com/gp/v/save/<JWT>
```

The URL contains a signed JWT (JSON Web Token) that encodes one or more pass references or full pass objects.  OSS CardWallet can decode this JWT and turn each pass object into a card you can store locally.

## Supported Pass Types

| Google Wallet Type | Displayed As |
|---|---|
| Transit ticket (`transitObjects`) | Event Ticket |
| Boarding pass (`flightObjects`) | Boarding Pass |
| Event ticket (`eventTicketObjects`) | Event Ticket |
| Loyalty card (`loyaltyObjects`) | Store Card |
| Gift card (`giftCardObjects`) | Store Card |
| Generic pass (`genericObjects`) | Generic Card |

## Importing a Google Wallet Link

### Option 1 — Paste the URL manually

1. Copy the full Google Wallet URL (starts with `https://pay.google.com/gp/v/save/…`)
2. Open **OSS CardWallet** and tap the **+** button
3. Select **Import from Google Wallet link**
4. Paste the URL into the dialog and tap **Import**

The pass (or passes, if the link contains multiple objects) will be added to your wallet immediately.

### Option 2 — Open from browser or email (Android)

On Android, OSS CardWallet registers itself as a handler for `pay.google.com` links.  When you tap a Google Wallet link in a browser or email app:

1. Android will offer to open it with **OSS CardWallet**
2. Select OSS CardWallet from the list
3. The pass is imported automatically

### Option 3 — Scan a QR code containing the link

If you have a QR code that encodes a Google Wallet URL:

1. Import the image of the QR code using **Add from camera** or **Import from image**
2. Once the QR code is detected, the URL is stored as the card barcode
3. Long-press the card → **Import from Google Wallet link** and paste the URL

## How the Barcode Works

Because most Google Wallet links contain only pass *references* (not the full pass data), OSS CardWallet stores the original URL as the card's QR code barcode.

This means you can:
- **Show the QR code** in the app to be scanned by another device
- **Open the pass in Google Wallet** by scanning the QR from any QR reader

When a Google Wallet link does contain fully embedded pass data (as issued by some transit operators) the fields, colours, and barcode from the embedded objects are used directly.

## Limitations

| Limitation | Explanation |
|---|---|
| **Pass images** | Google Wallet images (logos, background) are hosted on Google's servers and are not downloaded. Cards will appear without images. |
| **Live updates** | Google Wallet passes can be updated server-side. Imported cards are a static snapshot and will not reflect updates. |
| **Pass validation** | The JWT signature is not verified — the URL is assumed to come from a trusted source (email, website, QR code). |
| **Private API data** | When the JWT contains only object references the full pass details are on Google's servers and require authentication to retrieve. |

## Troubleshooting

### "The link does not appear to be a valid Google Wallet URL"

Make sure the URL starts with `https://pay.google.com/gp/v/save/` and that you copied the complete URL without truncation.

### Card shows no information except an ID

The Google Wallet link you imported contains only pass *references*.  The barcode on the card encodes the original URL — scanning it will open the pass in Google Wallet on any device that has it installed.

### Multiple cards were created

A single Google Wallet link can contain multiple pass objects (e.g. one ticket per passenger or per journey leg).  OSS CardWallet creates one card page per object within the same document.
