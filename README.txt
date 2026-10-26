FitPath AI static website starter

Contents:
- index.html: the current FitPath AI prototype, renamed as the homepage entry point.

Important:
This is a front-end demonstration only. It does not include real AI API integration, customer accounts, cloud-saved data, or subscription payments. Do not collect sensitive health or payment information through this prototype.

Deployment overview:
1. Upload this folder to a GitHub repository (the homepage file must be named index.html at the repository root).
2. Import the repository into Vercel and deploy it as a static site (no build command required; output directory can be left blank or set to the root, depending on the UI).
3. In Vercel project Settings > Domains, add myfitpathai.com and www.myfitpathai.com.
4. Follow the exact DNS records Vercel displays, then enter those records in GoDaddy DNS settings. Do not delete existing MX/email records if you use domain email.
5. Wait for Vercel to verify DNS and provision HTTPS.
