# Milk Ledger: first Google Play release

## Current status

The repository contains the migrated TanStack Start web application, not a release-ready Android App Bundle. The hosted application is at https://milk-minder-bill-buddy.lovable.app. Copying source to GitHub does not create an Android release or connect automatic Lovable Git sync.

The owner has a Google Play developer account and this will be the first listing. No Play Console submission, Android signing, or Android device validation has been performed.

## Android release preparation (outside Lovable)

Keep the web application hosted; its server-side features cannot be bundled as static Android assets. An Android developer should package the hosted experience using a Trusted Web Activity, with a web manifest, appropriate icons, and verified Digital Asset Links on the hosted origin. This approach uses the browser rather than embedding Google sign-in inside an unsupported WebView. It must still be checked against current Google Play quality and functionality requirements.

The original archive used application ID `org.truship.milkledger`; confirm ownership and availability before using it for the first listing. Do not reuse an old signing identity unless the owner controls it. Configure a release signing key securely, enable Play App Signing, and use the Play app-signing certificate fingerprint for Digital Asset Links. Never commit signing keys, passwords, or Play account credentials.

An Android developer must produce and validate the signed `.aab` with a currently compliant target Android SDK. The existing web repository alone cannot produce that artifact.

## Required device checks

- Google sign-in returns to the correct app and preserves the session.
- Delivery marks, seller settings, rates, and recorded payments save and read back after reopening.
- UPI opens a compatible payment app on a physical phone. Never record payment as successful automatically: this app cannot verify UPI completion.
- Bill sharing, back navigation, and account deletion work on Android.
- Offline/network failures and unavailable UPI applications have usable outcomes.
- App icons, launch screen, accessibility, and small-screen layouts are checked.

## Owner's Play Console tasks

1. Create the first app listing and confirm the package ID.
2. Complete developer verification and any testing prerequisites shown for this developer account; requirements differ by account.
3. Supply the app name, descriptions, contact details, icon, feature graphic, and genuine phone screenshots.
4. Confirm the privacy policy accurately describes the live app's data handling, and provide both in-app and public web account-deletion options as required by Play policy. Existing account deletion in settings is not evidence that the external deletion requirement is met.
5. Complete Data safety, content rating, audience, ads, and app-access declarations. Do not guess the answers; disclose actual collection and processing by the app and its services.
6. Upload the signed App Bundle to internal testing, resolve reported issues, complete any required closed testing, and request production access where required.
7. Submit the production release for Google's review. Availability follows approval; no publication date is guaranteed.

## Blockers

- Android packaging and signed App Bundle are not yet supplied.
- The signing certificate is needed before configuring verified app links.
- Play Console declarations, listing assets, required testing, and review remain the owner's responsibility.

Reference: https://support.google.com/googleplay/android-developer/