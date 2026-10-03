"""
Public legal & support pages for the Film Companion app.

Google Play needs public URLs for the privacy policy, account deletion and
user support, and the app links to the terms and community guidelines from
its login screen and profile. Routes (GET + HEAD, no login needed):

    /legal                  index
    /legal/terms            Terms of Use
    /legal/privacy          Privacy Policy
    /legal/guidelines       Community Guidelines (incl. #child-safety standards)
    /legal/delete-account   how to delete an account + web request form
    /legal/contact          support + Grievance Officer contact

`router` is mounted on the FastAPI `app` itself, NOT under /api, so the
auth gate lets these through. Every page is a self-contained, mobile-friendly
HTML document: inline CSS, one small inline script on the deletion page (it
POSTs JSON to the public /api/account-deletion-request), no external assets.
A strict Content-Security-Policy pins the inline style/script by hash.

Company and contact details come from settings (env): APP_DISPLAY_NAME,
LEGAL_COMPANY_NAME, LEGAL_COMPANY_ADDRESS, SUPPORT_EMAIL,
GRIEVANCE_OFFICER_NAME, GRIEVANCE_OFFICER_EMAIL, LEGAL_EFFECTIVE_DATE. Every
interpolated value is HTML-escaped (see `_context`); page templates are only
ever rendered with that escaped context.

The wording is a careful plain-English draft for an India-registered company.
Have it reviewed by a lawyer before launch, and update LEGAL_EFFECTIVE_DATE
(and the app's TERMS_VERSION, so users re-accept) when it changes materially.
"""

from __future__ import annotations

import base64
import hashlib
import html
from datetime import datetime, timezone
from typing import Dict, Optional
from urllib.parse import quote

from fastapi import APIRouter
from fastapi.responses import HTMLResponse

from settings import settings

router = APIRouter()


# ----------------------------------------------------------------------
# Shared layout
# ----------------------------------------------------------------------

_CSS = """
:root{color-scheme:light dark;--bg:#fff;--fg:#1d1d1f;--muted:#5f6368;--accent:#ad1457;--btn:#ad1457;--card:#f6f6f8;--border:#e3e3e8;--ok:#1b7f3b;--err:#b3261e}
@media (prefers-color-scheme:dark){:root{--bg:#121216;--fg:#ececf1;--muted:#a8a8b3;--accent:#ff8fb3;--btn:#d81b60;--card:#1c1c22;--border:#2e2e38;--ok:#6fdc97;--err:#ff8a80}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans",Arial,sans-serif;overflow-wrap:break-word}
.wrap{max-width:760px;margin:0 auto;padding:0 20px}
.site{border-bottom:1px solid var(--border);padding:14px 0 12px}
.brand{font-weight:700;font-size:18px;color:var(--fg);text-decoration:none}
.site nav{display:flex;flex-wrap:wrap;gap:4px 16px;margin-top:6px;font-size:14px}
.site nav a{color:var(--muted);text-decoration:none;padding:4px 0}
.site nav a[aria-current=page]{color:var(--accent);font-weight:600}
main{padding-bottom:28px}
h1{font-size:28px;line-height:1.25;margin:22px 0 6px}
h2{font-size:20px;line-height:1.3;margin:30px 0 8px;scroll-margin-top:12px}
h3{font-size:17px;margin:20px 0 6px}
p,li{margin:0 0 10px}
ul,ol{padding-left:22px;margin:0 0 12px}
a{color:var(--accent)}
.meta,.muted{color:var(--muted);font-size:14px}
.meta{margin:0 0 16px}
.summary,.callout,.card,.toc{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:14px 18px;margin:16px 0}
.callout{border-left:4px solid var(--accent)}
.summary>:last-child,.callout>:last-child,.card>:last-child{margin-bottom:0}
.toc ol{margin:6px 0 0}
.toc li{margin:0 0 4px}
.pages li{margin-bottom:14px}
dl{margin:0}
dt{font-weight:600}
dd{margin:0 0 10px}
form label{display:block;font-weight:600;margin:14px 0 6px}
input,textarea{display:block;width:100%;font:inherit;color:inherit;background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:12px}
textarea{min-height:96px;resize:vertical}
button{margin-top:16px;width:100%;font:inherit;font-weight:600;color:#fff;background:var(--btn);border:0;border-radius:10px;padding:13px 18px;cursor:pointer}
button[disabled]{opacity:.6;cursor:default}
.status{margin:12px 0 0;font-weight:600}
.status.ok{color:var(--ok)}
.status.err{color:var(--err)}
footer{border-top:1px solid var(--border);padding:16px 0 36px;color:var(--muted);font-size:14px}
footer p{margin:0 0 6px}
@media (min-width:640px){button{width:auto}}
"""

# Static (no interpolation) so its CSP hash is fixed. The form is rendered
# `hidden` and only revealed here, so without JavaScript visitors just see the
# email alternative next to it.
_DELETE_FORM_JS = """
(function () {
  var form = document.getElementById('deletion-form');
  if (!form || !window.fetch) { return; }
  var contact = document.getElementById('deletion-contact');
  var reason = document.getElementById('deletion-reason');
  var button = document.getElementById('deletion-submit');
  var status = document.getElementById('deletion-status');
  form.hidden = false;
  function show(text, ok) {
    status.textContent = text;
    status.className = 'status ' + (ok ? 'ok' : 'err');
  }
  form.addEventListener('submit', function (event) {
    event.preventDefault();
    var value = contact.value.trim();
    if (value.length < 3) {
      show('Please enter the phone number or email address you signed up with.', false);
      contact.focus();
      return;
    }
    button.disabled = true;
    status.className = 'status';
    status.textContent = 'Sending\\u2026';
    fetch('/api/account-deletion-request', {
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'Accept': 'application/json'},
      body: JSON.stringify({contact: value, reason: reason.value.trim() || null})
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (res.ok && data && data.success) {
          form.reset();
          show(data.message || 'Thanks, we have received your request.', true);
        } else if (res.status === 429) {
          show('Too many requests from this network. Please try again later, or email us instead.', false);
        } else {
          show('We could not submit your request. Please check what you entered, or email us instead.', false);
        }
      });
    }, function () {
      show('We could not reach our server. Please check your connection, or email us instead.', false);
    }).then(function () {
      button.disabled = false;
    });
  });
})();
"""


def _csp_source_hash(source: str) -> str:
    digest = hashlib.sha256(source.encode("utf-8")).digest()
    return "'sha256-" + base64.b64encode(digest).decode("ascii") + "'"


_CSP = "; ".join((
    "default-src 'none'",
    "style-src " + _csp_source_hash(_CSS),
    # 'self' only so a same-origin helper injected by a proxy/CDN still runs.
    "script-src 'self' " + _csp_source_hash(_DELETE_FORM_JS),
    "connect-src 'self'",
    "img-src 'self' data:",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
))

_HEADERS = {
    "Content-Security-Policy": _CSP,
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "public, max-age=300",
}

# (path, short nav label) — order of the header navigation.
_NAV = (
    ("/legal/terms", "Terms"),
    ("/legal/privacy", "Privacy"),
    ("/legal/guidelines", "Community Guidelines"),
    ("/legal/delete-account", "Delete account"),
    ("/legal/contact", "Contact"),
)


def _esc(value: object) -> str:
    return html.escape("" if value is None else str(value), quote=True)


def _one_line(value: str) -> str:
    """Multi-line env values (e.g. an address) rendered on one line."""
    return ", ".join(part.strip() for part in str(value or "").splitlines() if part.strip())


def _mailto(address: str, subject: Optional[str] = None) -> str:
    href = "mailto:" + quote((address or "").strip(), safe="@.+-_")
    if subject:
        href += "?subject=" + quote(subject, safe="")
    return href


def _context() -> Dict[str, str]:
    """Every value a page template may interpolate, HTML-escaped."""
    s = settings
    app_name = _one_line(s.app_display_name)
    return {
        "app": _esc(app_name),
        "company": _esc(_one_line(s.legal_company_name)),
        "address": _esc(_one_line(s.legal_company_address)),
        "support_email": _esc(s.support_email),
        "support_mailto": _esc(_mailto(s.support_email)),
        "grievance_name": _esc(_one_line(s.grievance_officer_name)),
        "grievance_email": _esc(s.grievance_officer_email),
        "grievance_mailto": _esc(_mailto(s.grievance_officer_email)),
        "deletion_mailto": _esc(_mailto(s.support_email, f"Account deletion request - {app_name}")),
        "child_safety_mailto": _esc(_mailto(s.grievance_officer_email, f"Child safety - {app_name}")),
        "effective_date": _esc(_one_line(s.legal_effective_date)),
        "year": _esc(datetime.now(timezone.utc).year),
    }


def _page(path: str, title_tpl: str, body_tpl: str, *, script: Optional[str] = None) -> HTMLResponse:
    """Render one page. `title_tpl` / `body_tpl` are HTML templates whose
    only placeholders are keys of the escaped `_context()`."""
    c = _context()
    title = title_tpl.format_map(c)
    body = body_tpl.format_map(c)
    nav = "".join(
        '<a href="{href}"{current}>{label}</a>'.format(
            href=href, label=_esc(label), current=' aria-current="page"' if href == path else ""
        )
        for href, label in _NAV
    )
    parts = [
        '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n',
        '<meta name="viewport" content="width=device-width, initial-scale=1">\n',
        '<meta name="color-scheme" content="light dark">\n',
        "<title>", title, " · ", c["app"], "</title>\n",
        '<link rel="icon" href="data:,">\n',
        "<style>", _CSS, "</style>\n",
        "</head>\n<body>\n",
        '<header class="site"><div class="wrap">',
        '<a class="brand" href="/legal">', c["app"], "</a>",
        '<nav aria-label="Legal and support pages">', nav, "</nav>",
        "</div></header>\n",
        '<main class="wrap">\n', body, "\n</main>\n",
        '<footer><div class="wrap">',
        "<p>", c["app"], " is operated by ", c["company"], ", ", c["address"], ".</p>",
        '<p>Questions? Email <a href="', c["support_mailto"], '">', c["support_email"], "</a> or see ",
        '<a href="/legal/contact">Contact &amp; grievances</a>.</p>',
        "<p>This product uses the TMDB API but is not endorsed or certified by TMDB.</p>",
        "<p>&copy; ", c["year"], " ", c["company"], "</p>",
        "</div></footer>\n",
    ]
    if script:
        parts += ["<script>", script, "</script>\n"]
    parts.append("</body>\n</html>\n")
    return HTMLResponse("".join(parts), headers=dict(_HEADERS))


def _route(path: str):
    return router.api_route(
        path, methods=["GET", "HEAD"], response_class=HTMLResponse, include_in_schema=False
    )


# ----------------------------------------------------------------------
# Index
# ----------------------------------------------------------------------

_INDEX = """
<h1>Legal &amp; support</h1>
<p>Everything about using {app} safely and how we handle your information.</p>
<ul class="pages">
  <li><a href="/legal/terms"><strong>Terms of Use</strong></a><br>The rules for using {app}, including our AI assistant Tina.</li>
  <li><a href="/legal/privacy"><strong>Privacy Policy</strong></a><br>What information we collect, why, who we share it with and your rights.</li>
  <li><a href="/legal/guidelines"><strong>Community Guidelines</strong></a><br>What is and isn't allowed, how to report and block, and our child safety standards.</li>
  <li><a href="/legal/delete-account"><strong>Delete your account</strong></a><br>How to delete your account and data, in the app or with a web request.</li>
  <li><a href="/legal/contact"><strong>Contact &amp; support</strong></a><br>Reach our support team and our Grievance Officer.</li>
</ul>
"""


# ----------------------------------------------------------------------
# Terms of Use
# ----------------------------------------------------------------------

_TERMS = """
<h1>Terms of Use</h1>
<p class="meta">Effective date: {effective_date}</p>

<div class="summary">
  <p><strong>The short version</strong></p>
  <ul>
    <li>You must be 18 or older to use {app}.</li>
    <li>One account per person. Use your real age and photos of yourself.</li>
    <li>We have <strong>zero tolerance</strong> for objectionable content and abusive users. If you break the rules, we remove content and may ban you.</li>
    <li>Tina is an AI. Her replies can be wrong, they are not professional advice, and you should not share sensitive information with her.</li>
    <li>Take care when you meet people in person. We do not run background checks.</li>
    <li>You can delete your account at any time from <strong>Profile &rarr; Delete account</strong>.</li>
  </ul>
  <p class="muted">This summary is for convenience only. The full Terms below apply.</p>
</div>

<nav class="toc" aria-label="Contents">
  <strong>Contents</strong>
  <ol>
    <li><a href="#about">About these Terms</a></li>
    <li><a href="#service">What {app} is</a></li>
    <li><a href="#eligibility">Who can use {app}</a></li>
    <li><a href="#account">Your account</a></li>
    <li><a href="#conduct">Community Guidelines and prohibited conduct</a></li>
    <li><a href="#moderation">How we moderate</a></li>
    <li><a href="#tina">Tina, our AI assistant</a></li>
    <li><a href="#safety">Meeting people safely</a></li>
    <li><a href="#your-content">Your content</a></li>
    <li><a href="#our-content">Our content and intellectual property</a></li>
    <li><a href="#termination">Deleting your account, suspension and termination</a></li>
    <li><a href="#changes-service">Changes to the Service</a></li>
    <li><a href="#disclaimers">Disclaimers</a></li>
    <li><a href="#liability">Limitation of liability</a></li>
    <li><a href="#indemnity">Indemnity</a></li>
    <li><a href="#law">Governing law and disputes</a></li>
    <li><a href="#grievance">Grievance redressal</a></li>
    <li><a href="#changes">Changes to these Terms</a></li>
    <li><a href="#general">General</a></li>
  </ol>
</nav>

<h2 id="about">1. About these Terms</h2>
<p>These Terms of Use ("Terms") are an agreement between you and {company} ("we", "us" or "our"), a company registered in India with its registered office at {address}. They cover your use of the {app} mobile app, our AI assistant Tina, and these web pages (together, the "Service").</p>
<p>By creating an account or using the Service, you agree to these Terms, our <a href="/legal/guidelines">Community Guidelines</a> and our <a href="/legal/privacy">Privacy Policy</a>. If you do not agree, please do not use the Service.</p>
<p>These Terms are an electronic record under the Information Technology Act, 2000 and the rules made under it. They are published in line with the Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021 and do not need a physical or digital signature.</p>

<h2 id="service">2. What {app} is</h2>
<p>{app} helps adults meet people through a shared love of films, either for dating or to find a "movie buddy" to watch films with. We suggest people to you based on your profile, your preferences and your movie taste. Tina, our AI assistant, helps you set up your profile and chats with you by text and by voice.</p>
<p>The Service is currently free. There are no ads and no in-app purchases. If we ever introduce paid features, we will tell you before they start and they will come with their own terms.</p>

<h2 id="eligibility">3. Who can use {app}</h2>
<p>You may use the Service only if all of the following are true:</p>
<ul>
  <li>you are at least 18 years old;</li>
  <li>you can enter into a legally binding contract under Indian law;</li>
  <li>you are not prohibited from using the Service by any law that applies to you;</li>
  <li>you have never been convicted of a sexual offence or of an offence involving violence or the threat of violence, and you are not required to register as a sex offender anywhere; and</li>
  <li>we have not previously suspended or banned you from the Service.</li>
</ul>
<p>We do not allow anyone under 18 to use {app}. If we learn or reasonably believe that a user is under 18, we will delete their account. If you think a user is under 18, please report them.</p>

<h2 id="account">4. Your account</h2>
<ul>
  <li><strong>One person, one account.</strong> Do not create more than one account, and do not create or use an account for someone else.</li>
  <li><strong>Be accurate.</strong> Use your real first name and date of birth, and photos that clearly show you. Keep your profile up to date.</li>
  <li><strong>Keep your login safe.</strong> You sign in with a one-time code sent to your phone, or with your Google account. Keep your phone and Google account secure and never share a login code with anyone. We will never ask you for it.</li>
  <li><strong>You are responsible for your account,</strong> including everything done with it. If you think someone else has accessed it, contact us straight away.</li>
  <li>We may ask you to confirm information about your account, and we may limit the account while we check.</li>
</ul>

<h2 id="conduct">5. Community Guidelines and prohibited conduct</h2>
<p>Our <a href="/legal/guidelines">Community Guidelines</a> explain what is and isn't allowed on {app}. They are part of these Terms. In particular, you must not host, display, upload, share or send anything, or behave in any way, that:</p>
<ul>
  <li>is nude, pornographic, obscene or sexually explicit, or is a sexual message or image that the other person has not clearly welcomed;</li>
  <li>harasses, bullies, threatens, stalks, intimidates, insults or abuses anyone, including on the basis of their gender;</li>
  <li>is hateful, or is racially or ethnically objectionable, or promotes discrimination, violence or enmity between groups, for example on the grounds of religion or caste;</li>
  <li>scams, defrauds or deceives anyone, or asks other users for money, gifts, loans or financial information;</li>
  <li>advertises, sells or promotes anything, or is spam;</li>
  <li>impersonates any person, or uses a fake profile or someone else's photos;</li>
  <li>involves anyone under 18 in any sexual or exploitative way, or is otherwise harmful to children (we have zero tolerance for this and report it to the authorities);</li>
  <li>promotes or involves illegal activity, including drugs, weapons, gambling or betting, money laundering or trafficking;</li>
  <li>invades anyone's privacy, including sharing their personal information or intimate images without their consent;</li>
  <li>belongs to someone else and you have no right to share it, or infringes any copyright, trademark or other intellectual property right;</li>
  <li>knowingly spreads information that is false or misleading, including about where a message came from;</li>
  <li>threatens the unity, integrity, defence, security or sovereignty of India, friendly relations with other countries or public order, or incites anyone to commit an offence or prevents its investigation;</li>
  <li>contains viruses or other harmful code, or tries to hack, scrape, overload or interfere with the Service, access other people's accounts or use bots or automation;</li>
  <li>tries to make Tina produce harmful, sexual or illegal content, or uses Tina to harass or deceive others; or</li>
  <li>breaks any law in force in India.</li>
</ul>
<div class="callout">
  <p><strong>Zero tolerance.</strong> We have zero tolerance for objectionable content and abusive users. Breaking these rules can lead to your content being removed and your account being suspended or permanently banned, without warning for serious violations.</p>
</div>

<h2 id="moderation">6. How we moderate</h2>
<ul>
  <li><strong>Report and block.</strong> You can report or block anyone from their profile (the &#8943; button) or from a chat, and report any of Tina's replies. See <a href="/legal/guidelines#report">how to report and block</a>.</li>
  <li><strong>We review reports.</strong> Our team reviews reports and aims to act within 24 hours. Where the law requires faster action, for example removing content that shows a person in nudity or a sexual act or impersonates them (including morphed images) within 24 hours of their complaint, we act within that time.</li>
  <li><strong>What we may do.</strong> Depending on what we find, we may remove content or disable access to it, warn the user, restrict features, suspend the account, permanently ban the person and stop them from creating new accounts, and report the matter to the police or other authorities.</li>
  <li><strong>Behaviour outside the app counts.</strong> We may act on what someone does off {app} when it relates to the Service, for example their behaviour when meeting someone they matched with.</li>
  <li>We do not check everything before it is posted and cannot promise to catch every breach, but we act on what is reported to us and what we find.</li>
  <li>If you think we made a mistake, contact our <a href="#grievance">Grievance Officer</a>.</li>
</ul>

<h2 id="tina">7. Tina, our AI assistant</h2>
<ul>
  <li><strong>Tina is an AI, not a person.</strong> Her text replies, her voice and her suggestions are generated automatically by artificial intelligence (AI) models provided by our service providers.</li>
  <li><strong>Tina can be wrong.</strong> AI-generated content may be inaccurate, incomplete, out of date or inappropriate. Do not rely on it for important decisions, and check anything that matters yourself.</li>
  <li><strong>Not professional advice.</strong> Tina is not a doctor, therapist, counsellor, lawyer or financial adviser, and she cannot help in an emergency. If you are in danger, call 112.</li>
  <li><strong>Don't share sensitive information with Tina,</strong> such as login codes or passwords, bank or card details, Aadhaar, PAN or other ID numbers, health information, or anything else you need to keep private. Tina does not need any of it.</li>
  <li><strong>How your chats are processed.</strong> What you type or say to Tina, including your voice when you use voice features, is sent to our AI service providers to generate her replies. See the <a href="/legal/privacy#ai">Privacy Policy</a>.</li>
  <li><strong>Suggestions are only suggestions.</strong> Match suggestions are generated with the help of AI from profiles and movie taste. They are not a promise of compatibility or a judgement about anyone's character or safety.</li>
  <li><strong>Report a bad reply.</strong> Long-press one of Tina's messages or tap the flag icon next to it. During a voice call with Tina, tap the flag button. We review every report.</li>
</ul>

<h2 id="safety">8. Meeting people safely</h2>
<p><strong>We do not run criminal background checks or verify the identity of our users,</strong> and we cannot guarantee that anyone is who they say they are. You are responsible for your interactions with other users. Some sensible precautions:</p>
<ul>
  <li>Take your time. Chat in the app before you meet, and don't feel pressured.</li>
  <li>Meet in a busy public place, such as a cinema, café or restaurant, and stay in public places for the first few meetings.</li>
  <li>Tell a friend or family member where you are going and who you are meeting, and share your live location with them.</li>
  <li>Arrange your own travel, and keep your phone, drink and belongings with you.</li>
  <li>Never send money, gift cards, recharges or bank details to someone you met on the app, and never share a one-time code (OTP), whatever reason they give.</li>
  <li>Trust your instincts. If something feels wrong, leave, then block and report the person.</li>
  <li>In an emergency in India, call <strong>112</strong>. To report online fraud, call <strong>1930</strong> or visit <a href="https://cybercrime.gov.in">cybercrime.gov.in</a>.</li>
</ul>

<h2 id="your-content">9. Your content</h2>
<ul>
  <li>You own the content you add to {app}, such as your profile, photos and messages ("your content").</li>
  <li>You give us a non-exclusive, royalty-free, worldwide licence to host, store, copy, process, adapt (for example, resize or compress photos) and display your content, only so that we can operate and provide the Service to you and to other users. For example, we store your photos and show your profile to people we suggest to you. We do not use your content in advertising and we do not sell it.</li>
  <li>This licence ends when you delete the content or your account, except for copies we keep as described in our <a href="/legal/privacy#retention">Privacy Policy</a> (such as backups for up to 90 days and records we need for safety or must keep by law).</li>
  <li>You are responsible for your content. You promise that you have the right to share it and that it follows these Terms and our Community Guidelines.</li>
  <li>People you message can read what you send them, and they may have saved it (for example, as a screenshot). We cannot delete copies held by others.</li>
</ul>

<h2 id="our-content">10. Our content and intellectual property</h2>
<ul>
  <li>The Service, including the app, its software and design, the {app} name and logo, and Tina, belongs to us or our licensors. We give you a personal, non-exclusive, non-transferable and revocable licence to use the app for its intended purpose in line with these Terms.</li>
  <li>Do not copy, modify, distribute, sell or lease any part of the Service, or reverse engineer it, except where the law allows you to.</li>
  <li>Movie information and posters are provided by TMDB (The Movie Database). This product uses the TMDB API but is not endorsed or certified by TMDB. Film titles, posters and related material belong to their owners.</li>
  <li>If you believe something on the Service infringes your rights, please contact our <a href="#grievance">Grievance Officer</a>.</li>
</ul>

<h2 id="termination">11. Deleting your account, suspension and termination</h2>
<ul>
  <li>You can stop using the Service and delete your account at any time from <strong>Profile &rarr; Delete account</strong>, or by following the steps on our <a href="/legal/delete-account">account deletion page</a>. Uninstalling the app does not delete your account.</li>
  <li>We may suspend or end your account, or restrict your access, if you break these Terms or the law, if your account creates a risk for other users or for us, if the law requires it, or if we stop offering the Service. Where it is appropriate and lawful, we will tell you why.</li>
  <li>When your account ends, your right to use the Service ends too. We delete your data as explained in the Privacy Policy. Sections of these Terms that by their nature should continue (such as disclaimers, limitation of liability and governing law) continue to apply.</li>
</ul>

<h2 id="changes-service">12. Changes to the Service</h2>
<p>We are always improving {app}, so we may add, change or remove features. We may also suspend or stop the Service, and will give reasonable notice in the app where we can.</p>

<h2 id="disclaimers">13. Disclaimers</h2>
<ul>
  <li>To the extent the law allows, the Service is provided "as is" and "as available". We work hard to keep it safe and running, but we do not promise that it will always be available, error-free or secure, or that you will find a match.</li>
  <li>For content that users share, we act as an intermediary under the Information Technology Act, 2000. We are not responsible for what other users post or send, or for how they behave, whether on the Service or when you meet them, although we act on reports as described above.</li>
  <li>Nothing in these Terms takes away rights you have under law that cannot be excluded or limited.</li>
</ul>

<h2 id="liability">14. Limitation of liability</h2>
<p>To the maximum extent permitted by law:</p>
<ul>
  <li>we are not liable for any indirect, incidental, special, consequential or punitive loss or damage, or for any loss of profits, revenue, data or goodwill, arising from your use of, or inability to use, the Service; and</li>
  <li>our total liability to you for all claims relating to the Service is limited to &#8377;5,000 (five thousand Indian rupees).</li>
</ul>
<p>These limits do not apply to liability that cannot be limited or excluded by law, including liability for fraud, or for death or personal injury caused by our negligence.</p>

<h2 id="indemnity">15. Indemnity</h2>
<p>If someone makes a claim against us because you broke these Terms or the law, or because of content you shared, you agree to cover the reasonable losses and costs (including reasonable legal fees) that we incur as a result, to the extent permitted by law.</p>

<h2 id="law">16. Governing law and disputes</h2>
<p>These Terms are governed by the laws of India. If you have a problem with the Service, please contact us first. Most issues can be resolved quickly through our <a href="#grievance">grievance process</a>. Subject to any right you have under consumer protection law to bring a claim where you live, the courts with jurisdiction over our registered office have exclusive jurisdiction over any dispute relating to these Terms or the Service.</p>

<h2 id="grievance">17. Grievance redressal</h2>
<p>In line with the Information Technology Act, 2000 and the Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021, we have appointed a Grievance Officer:</p>
<div class="card">
  <dl>
    <dt>Name</dt><dd>{grievance_name}</dd>
    <dt>Email</dt><dd><a href="{grievance_mailto}">{grievance_email}</a></dd>
    <dt>Address</dt><dd>{company}, {address}</dd>
  </dl>
</div>
<p>You can contact the Grievance Officer about content or behaviour on {app} that breaks these Terms or the law, about your account (including a suspension or ban), or about how we handle your personal data. We will acknowledge your complaint within 24 hours and resolve it within 15 days of receiving it, or sooner where the law requires. If you are not satisfied with the Grievance Officer's decision, you may appeal to the Grievance Appellate Committee set up by the Government of India at <a href="https://gac.gov.in">gac.gov.in</a> within 30 days of receiving the decision.</p>

<h2 id="changes">18. Changes to these Terms</h2>
<p>We may update these Terms from time to time. If we make significant changes, we will tell you in the app before they take effect and may ask you to accept the new Terms before you continue using {app}. Changes needed for legal or safety reasons may take effect sooner. The effective date at the top of this page shows the latest version. We will also remind you of these Terms and our Community Guidelines from time to time, at least once a year. If you do not agree with the updated Terms, please stop using the Service and delete your account.</p>

<h2 id="general">19. General</h2>
<ul>
  <li>These Terms, our Community Guidelines and our Privacy Policy are the whole agreement between you and us about the Service.</li>
  <li>If any part of these Terms is found to be unenforceable, the rest stays in effect.</li>
  <li>If we don't enforce a part of these Terms straight away, we can still enforce it later.</li>
  <li>You may not transfer your rights under these Terms to anyone else. We may transfer ours as part of a merger, acquisition or sale of our business, and will tell you if that happens.</li>
  <li>Questions about these Terms? Email <a href="{support_mailto}">{support_email}</a> or see our <a href="/legal/contact">contact page</a>.</li>
</ul>
"""


# ----------------------------------------------------------------------
# Community Guidelines
# ----------------------------------------------------------------------

_GUIDELINES = """
<h1>Community Guidelines</h1>
<p class="meta">Effective date: {effective_date}</p>
<p>{app} is for adults who love films and want to meet people who do too, whether for a date or a movie buddy. These guidelines keep {app} safe and friendly. They apply everywhere on {app}: your profile and photos, your chats, voice features and conversations with Tina, and how you treat people you meet through the app.</p>

<div class="callout">
  <p><strong>Zero tolerance.</strong> We have zero tolerance for objectionable content and abusive users. If you break these guidelines, we may remove your content and suspend or permanently ban your account, without warning for serious violations. Where the law requires it, or where someone may be at risk, we report it to the police or other authorities.</p>
</div>

<h2 id="basics">The basics</h2>
<ul>
  <li><strong>Be yourself.</strong> Use your real first name, your real age and recent photos that clearly show you.</li>
  <li><strong>Be respectful.</strong> Treat people the way you want to be treated. If someone says no, doesn't reply, unmatches or blocks you, accept it and move on.</li>
  <li><strong>Adults only.</strong> You must be 18 or older to use {app}.</li>
  <li><strong>Look out for each other.</strong> If something seems wrong, report it. Reports are confidential.</li>
</ul>

<h2 id="not-allowed">What's not allowed</h2>
<p>The following content and behaviour are objectionable and not allowed anywhere on {app}:</p>

<h3>Nudity and sexual content</h3>
<p>No nudity, pornography or sexually explicit photos, videos or text, including in your profile. Don't send sexual messages or images to anyone who hasn't clearly welcomed them, and don't offer, request or pay for sexual services.</p>

<h3>Harassment and bullying</h3>
<p>No insulting, humiliating, intimidating, stalking or repeatedly contacting someone who doesn't want to hear from you. No unwanted advances after someone has said no, no comments that demean someone's gender, body or appearance, and no blackmail or "sextortion".</p>

<h3>Hate speech</h3>
<p>No content that attacks, demeans or promotes discrimination, hatred or enmity against people because of their religion, caste, race, ethnicity, nationality, region, language, gender, gender identity, sexual orientation, disability or health condition.</p>

<h3>Threats and violence</h3>
<p>No threats of violence against anyone, no content that encourages or glorifies violence, terrorism or self-harm, and no graphic violence. If you or someone you know is struggling, you can call Tele-MANAS, the Government of India's free mental health helpline, on <strong>14416</strong>. In an emergency, call <strong>112</strong>.</p>

<h3>Scams and fraud</h3>
<p>No romance scams, fake investment, crypto, job or lottery offers, phishing links, made-up emergencies or any other attempt to cheat people. Never ask anyone for their one-time codes (OTPs), passwords or bank details.</p>

<h3>Asking for money</h3>
<p>Never ask other users for money, gifts, loans, recharges, payments or any kind of financial help, for any reason. If someone asks you, please report them.</p>

<h3>Spam and commercial promotion</h3>
<p>{app} is not for advertising. No selling or promoting products, services or businesses, recruiting, multi-level marketing, promoting other apps or social media accounts to gain followers, chain messages or mass messaging. No bots or automated accounts.</p>

<h3>Impersonation and fake profiles</h3>
<p>No pretending to be someone else (including celebrities or public figures), using someone else's photos, using AI-generated or heavily edited photos that misrepresent you, lying about your age, running more than one account, or creating an account for someone else.</p>

<h3>Anything involving minors &mdash; zero tolerance</h3>
<p>You must be 18 or older. We do not allow any content or behaviour that sexualises, exploits or endangers anyone under 18. Profile photos of children on their own are not allowed either. We remove this content, permanently ban the accounts involved and report them to the authorities. See our <a href="#child-safety">child safety standards</a> below.</p>

<h3>Illegal activity and drugs</h3>
<p>No buying, selling or promoting illegal drugs, weapons or other illegal goods or services. No gambling, betting or unlawful online games, money laundering, human trafficking or any other illegal activity.</p>

<h3>Sharing other people's private information</h3>
<p>Don't share anyone's phone number, address, location, workplace, ID documents, photos, screenshots of your chats or other personal information without their permission. Sharing intimate images of someone without their consent is one of the most serious violations: we ban the account and cooperate with the police. Protect your own privacy too: don't put your phone number, address or social media handles in your profile.</p>

<h3>Intellectual property infringement</h3>
<p>Only upload photos and content that you own or have permission to use. Don't copy other people's photos, artwork or writing, or infringe anyone's copyright or trademark.</p>

<h3>False and misleading information</h3>
<p>Don't knowingly share false or misleading information, especially to deceive or harm someone.</p>

<h3>Misusing {app} or Tina</h3>
<p>No hacking, scraping, malware, exploiting bugs, trying to get into other people's accounts or deliberately trying to make Tina produce harmful, sexual or illegal content.</p>

<h3>Anything else that breaks the law</h3>
<p>No content that threatens the unity, integrity, defence, security or sovereignty of India, friendly relations with other countries or public order, or that encourages anyone to commit a crime. Nothing that breaks any law in force in India.</p>

<h2 id="child-safety">Child safety standards</h2>
<p>{app} is strictly for adults (18+). We prohibit child sexual abuse and exploitation (CSAE) in every form.</p>
<ul>
  <li><strong>No minors.</strong> People under 18 may not create an account. We remove accounts that we believe belong to someone under 18.</li>
  <li><strong>What is prohibited.</strong> Any content or behaviour that sexualises, grooms, exploits or endangers a child. This includes child sexual abuse material (CSAM), sexualised images or text involving a minor, and attempts to contact a minor or arrange to meet one.</li>
  <li><strong>How to report.</strong> Use Report on the person's profile or in the chat, or email <a href="{child_safety_mailto}">{grievance_email}</a> with the subject "Child safety". Include the profile name and what you saw, but do not download, save or share the content itself.</li>
  <li><strong>What we do.</strong> We treat these reports as our top priority. We remove the content, permanently ban the accounts involved, keep the evidence the law requires us to keep, and report the matter to the authorities, including through India's National Cyber Crime Reporting Portal (<a href="https://cybercrime.gov.in">cybercrime.gov.in</a>) or the police, as required by the Protection of Children from Sexual Offences (POCSO) Act, 2012 and the Information Technology Act, 2000.</li>
  <li><strong>Child safety contact.</strong> Our point of contact for child safety is {grievance_name}, <a href="{child_safety_mailto}">{grievance_email}</a>.</li>
  <li>If a child is in immediate danger, call <strong>112</strong>. You can also call Childline on <strong>1098</strong>.</li>
</ul>

<h2 id="report">How to report and block</h2>
<ul>
  <li><strong>A profile:</strong> open the person's profile, tap the &#8943; (more) button and choose <em>Report</em> or <em>Block</em>.</li>
  <li><strong>A chat:</strong> open the conversation, tap the menu and choose <em>Report</em>, <em>Block</em> or <em>Unmatch</em>.</li>
  <li><strong>One of Tina's replies:</strong> long-press the message, or tap the small flag icon next to it. During a voice call with Tina, tap the flag button.</li>
  <li><strong>By email:</strong> if you can't report in the app (for example, you aren't a member but someone is using your photos, or it is about something that happened offline), email <a href="{grievance_mailto}">{grievance_email}</a> with the profile name, what happened and any screenshots.</li>
</ul>
<p><strong>What blocking does:</strong> when you block someone, they disappear from your feed and you disappear from theirs, any conversation between you is closed, and neither of you can message the other. They are not told that you blocked them.</p>
<p>Reports are confidential. We never tell anyone who reported them.</p>

<h2 id="after-report">What happens after you report</h2>
<ul>
  <li>We aim to review every report within 24 hours. Reports involving immediate danger, minors or intimate images are handled first.</li>
  <li>We look at the reported content, the account and the context. This can include the messages in the reported conversation.</li>
  <li>Depending on what we find, we may remove content, warn the person, restrict or suspend their account, or permanently ban them and stop them from creating new accounts. Where the law requires it, or where someone's safety may be at risk, we report it to the police or other authorities.</li>
  <li>People you report no longer appear in your feed.</li>
  <li>To protect everyone's privacy, we may not be able to tell you exactly what action we took.</li>
  <li>Deliberately making false reports to harass someone is itself a breach of these guidelines.</li>
  <li>If your content was removed or your account was restricted and you think we got it wrong, contact our Grievance Officer through the <a href="/legal/contact">contact page</a>.</li>
</ul>

<h2 id="stay-safe">Stay safe when you meet</h2>
<p>Meet in a busy public place, tell a friend where you're going, arrange your own travel and never send money to someone you met online. Read more <a href="/legal/terms#safety">safety tips</a>. In an emergency, call <strong>112</strong>. To report online fraud, call <strong>1930</strong> or visit <a href="https://cybercrime.gov.in">cybercrime.gov.in</a>.</p>
"""


# ----------------------------------------------------------------------
# Privacy Policy
# ----------------------------------------------------------------------

_PRIVACY = """
<h1>Privacy Policy</h1>
<p class="meta">Effective date: {effective_date}</p>
<p>This policy explains what personal data {company} ("we", "us" or "our") collects when you use {app}, why we collect it, who we share it with, and the choices and rights you have. We have tried to keep it clear and readable.</p>

<div class="summary">
  <p><strong>The short version</strong></p>
  <ul>
    <li>We collect what we need to run a film-based dating and movie-buddy app: your login details, your profile, your approximate location, your movie taste and your chats.</li>
    <li>Other members can see your profile, but never your exact location, your date of birth, your phone number or your email address.</li>
    <li>Tina's replies are generated by AI providers (OpenAI for text and ElevenLabs for voice), so what you say to Tina is shared with them to create her responses.</li>
    <li>We don't sell your data and there are no ads in {app}.</li>
    <li>You can access, correct and delete your data, and you can delete your account at any time from <strong>Profile &rarr; Delete account</strong>.</li>
  </ul>
</div>

<nav class="toc" aria-label="Contents">
  <strong>Contents</strong>
  <ol>
    <li><a href="#who">Who we are</a></li>
    <li><a href="#collect">Information we collect</a></li>
    <li><a href="#use">How we use your information</a></li>
    <li><a href="#consent">Your consent</a></li>
    <li><a href="#sharing">Who can see your information and who we share it with</a></li>
    <li><a href="#transfers">Where your data is processed</a></li>
    <li><a href="#retention">How long we keep it</a></li>
    <li><a href="#security">How we protect it</a></li>
    <li><a href="#rights">Your rights and choices</a></li>
    <li><a href="#children">Children</a></li>
    <li><a href="#ai">Tina and other AI features</a></li>
    <li><a href="#changes">Changes to this policy</a></li>
    <li><a href="#contact">Contact us and our Grievance Officer</a></li>
  </ol>
</nav>

<h2 id="who">1. Who we are</h2>
<p>{app} is provided by {company}, a company registered in India with its registered office at {address}. We decide how and why your personal data is processed, which makes us the "Data Fiduciary" under India's Digital Personal Data Protection Act, 2023 (the "DPDP Act"). This policy is also published in line with the Information Technology Act, 2000 and the rules made under it.</p>
<p>This policy applies to the {app} Android app, our AI assistant Tina, and these web pages (together, the "Service").</p>

<h2 id="collect">2. Information we collect</h2>
<h3>Information you give us</h3>
<ul>
  <li><strong>Login details.</strong> If you sign in with your phone number, we collect your mobile number and send you a one-time code by SMS. If you sign in with Google, Google shares your name, email address, profile photo and a Google account identifier with us. We never see your Google password.</li>
  <li><strong>Your profile.</strong> Your name, date of birth (others only see your age), gender (and how you describe it, if you choose to), who you would like to meet, what you are looking for, the languages you speak and watch films in, your bio and your photos.</li>
  <li><strong>Optional details.</strong> You can choose to add details such as height, religion, marital status, education, work, food preferences, smoking and drinking habits, exercise, zodiac sign, pets, family plans, siblings and travel. These are optional. Some of them, such as religion, and your dating preferences, can be sensitive, so only add what you are comfortable sharing. The visibility settings in your profile let you control whether some of these details are shown to others.</li>
  <li><strong>Movie preferences and activity.</strong> Your favourite genres and films, the films you swipe on or rate and why, your movie library, how often and where you watch films, the mode you use (date or movie buddy) and the filters you set.</li>
  <li><strong>Messages.</strong> The messages you exchange with other members. If you, or the person you are chatting with, ask for reply suggestions, the last few messages of that chat are sent to our AI provider to create them (see <a href="#ai">section 11</a>).</li>
  <li><strong>Conversations with Tina.</strong> What you type or say to Tina, her replies, and your answers to her personality questions. When you use voice features, your voice recordings are sent to our voice provider to be turned into text, and Tina's replies are turned into speech. We don't keep your voice recordings on our servers after they have been converted.</li>
  <li><strong>Safety information.</strong> Reports you make (including reports about Tina's replies), people you block, your answers when we ask whether you met someone, and reports other people make about you.</li>
  <li><strong>Support and requests.</strong> When you contact us or send us a request, such as a request to delete your account, we keep your contact details and what you tell us.</li>
</ul>
<h3>Information collected automatically or worked out by us</h3>
<ul>
  <li><strong>Approximate location.</strong> When you set your location, the app uses your device's approximate location (with your permission) or the place you choose. We store your area or city plus map coordinates so we can find people near you and apply your distance preferences. The app asks only for approximate location, not your precise GPS location.</li>
  <li><strong>Device and log data.</strong> Technical information such as your IP address, app version, device and operating system type, the date and time of your requests, and error logs. We use it to keep the Service secure (for example, to stop spam and abuse), to fix problems and to understand how the Service performs.</li>
  <li><strong>Insights and suggestions.</strong> Tina summarises your personality and preferences (for example, a "movie personality" and love language) from your answers, and we calculate compatibility to suggest matches. Your personality summary may be shown on your profile.</li>
  <li><strong>Login token.</strong> When you sign in, we create a login token that is stored securely on your device so that you stay signed in.</li>
</ul>
<h3>What we don't collect</h3>
<p>We don't collect payment information (there are no payments in the app), your contacts or your precise GPS location. There are no advertising or third-party analytics tools in the app, and we don't use advertising IDs or tracking cookies. These web pages don't use cookies.</p>
<p>The app asks for permission to use your camera and photos only when you choose to add a profile photo, your microphone only when you use voice features with Tina, and your approximate location only when you set your location. You can turn these permissions off at any time in your phone's settings.</p>

<h2 id="use">3. How we use your information</h2>
<ul>
  <li>To create and secure your account and to sign you in.</li>
  <li>To build your profile and show it to other members.</li>
  <li>To suggest people to you, and you to them, based on your profile, preferences, approximate location and movie taste. Our AI providers help us rank suggestions.</li>
  <li>To recommend films and learn your movie taste.</li>
  <li>To let you chat with other members and with Tina, by text and by voice.</li>
  <li>To keep {app} safe: to review reports, enforce our <a href="/legal/terms">Terms of Use</a> and <a href="/legal/guidelines">Community Guidelines</a>, and to detect and prevent fraud, spam and abuse.</li>
  <li>To give you support and respond to your requests.</li>
  <li>To maintain and improve the Service, for example by fixing bugs and studying how features are used. For this we keep a copy of some activity in our analytics database, such as sign-ins, profile and preference changes, photos added or removed, swipes, match, unmatch, block and report events, and conversations with Tina. We do not copy the content of your messages with other members into it.</li>
  <li>To comply with the law and respond to lawful requests from authorities.</li>
</ul>
<p>Matching is automated, but it only decides which profiles we suggest. It does not affect your legal rights.</p>

<h2 id="consent">4. Your consent</h2>
<p>We process your personal data with your consent, which you give when you create your account and agree to this policy (and, for optional details, when you choose to add them), or where the DPDP Act otherwise permits it, for example to comply with the law.</p>
<p>You can withdraw your consent at any time, as easily as you gave it: remove optional details from your profile, stop using voice features, delete your account from <strong>Profile &rarr; Delete account</strong>, or contact our <a href="#contact">Grievance Officer</a>. Withdrawing consent does not affect processing that has already happened. Because we need basic profile information to run your account, withdrawing consent for it means we can no longer provide the Service to you. Once you withdraw consent, we stop processing the data concerned and delete it within a reasonable time, unless the law requires us to keep it.</p>

<h2 id="sharing">5. Who can see your information and who we share it with</h2>
<h3>Other members</h3>
<ul>
  <li>Members can see your profile: your name, age, gender, area or city, bio, photos, movie preferences, languages, what you are looking for, the optional details you have chosen to show, and your personality summary.</li>
  <li>Other members <strong>never</strong> see your exact location or coordinates, your date of birth, your phone number or your email address.</li>
  <li>The people you message can read your messages.</li>
</ul>
<h3>Our service providers</h3>
<p>We share personal data with the companies below, only as much as they need to provide their services to us, and under terms that restrict how they may use it:</p>
<ul>
  <li><strong>Railway</strong>: hosts our servers.</li>
  <li><strong>MongoDB Atlas</strong> (MongoDB, Inc.): our main database for accounts, profiles, chats and conversations with Tina.</li>
  <li><strong>Supabase</strong>: stores profile photos and the analytics copy of activity described in section 3.</li>
  <li><strong>OpenAI</strong>: the AI behind Tina's replies, match suggestions and chat helpers (ice-breakers and reply suggestions). We send it the parts of profiles, preferences and conversations that it needs to generate a response. For example, ice-breakers use both people's public profiles, and reply suggestions use the last few messages of that chat, including the other person's.</li>
  <li><strong>ElevenLabs</strong>: voice features. It turns Tina's replies into speech and your voice recordings into text.</li>
  <li><strong>Google</strong>: Google Sign-In (if you choose it), and Google Maps Platform, which turns place searches and coordinates into an area or city name.</li>
  <li><strong>Our SMS provider</strong> (such as MSG91 or Twilio): delivers login codes to your phone number.</li>
  <li><strong>TMDB</strong> (The Movie Database): provides movie information and posters. We don't share your personal data with TMDB. As with any website, its image servers receive your device's IP address when the app loads posters.</li>
</ul>
<h3>Legal reasons and safety</h3>
<p>We may share information when the law requires it, for example in response to a court order or a lawful request from a government or law enforcement agency, or when we believe in good faith that it is necessary to protect someone's safety, investigate fraud or abuse, or enforce our Terms.</p>
<h3>Business changes</h3>
<p>If we are involved in a merger, acquisition or sale of assets, your information may be transferred as part of that deal. We will make sure it stays protected and tell you about any change in who is responsible for it.</p>
<h3>No selling, no ads</h3>
<p>We do not sell or rent your personal data, we do not share it with advertisers or data brokers, and there are no ads in {app}.</p>

<h2 id="transfers">6. Where your data is processed</h2>
<p>Our service providers may store and process your data on servers outside India, for example in the United States, Europe or Singapore. We transfer data in line with the DPDP Act, which allows transfers except to countries restricted by the Government of India, and we take steps to protect your data wherever it is processed.</p>

<h2 id="retention">7. How long we keep it</h2>
<ul>
  <li>We keep your data while your account is active, for as long as we need it to provide the Service.</li>
  <li>When you delete your account in the app, we delete your account data from our live systems straight away. Deletion requests sent to us are completed within 30 days.</li>
  <li>Copies in our backups are deleted as the backups are overwritten, within 90 days.</li>
  <li>We keep some records for longer where needed for safety or by law: reports and moderation records (including reports made about an account and the action we took) for as long as needed to keep the community safe and handle disputes, and information the law requires us to keep, such as records Indian law requires us to hold for investigations or after an account is closed, for as long as it requires.</li>
  <li>Login codes expire after a few minutes and are only ever stored in scrambled (hashed) form.</li>
</ul>

<h2 id="security">8. How we protect your information</h2>
<p>We use reasonable security practices to protect your data. For example, the app talks to our servers over an encrypted (HTTPS) connection, login codes are stored only in hashed form, access to personal data is limited to people and services that need it, and we limit repeated requests to stop abuse. No system is completely secure, so please keep your phone and login codes safe. If a personal data breach affects you, we will inform you and the Data Protection Board of India as the law requires.</p>

<h2 id="rights">9. Your rights and choices</h2>
<p>Under the DPDP Act and other applicable law, you have the right to:</p>
<ul>
  <li><strong>Access:</strong> get a summary of the personal data we hold about you, how we process it, and who we have shared it with.</li>
  <li><strong>Correction:</strong> correct, complete or update your data. You can edit most of it directly in your profile.</li>
  <li><strong>Erasure:</strong> ask us to delete your data. You can delete your account at any time from <strong>Profile &rarr; Delete account</strong>, or see our <a href="/legal/delete-account">account deletion page</a>.</li>
  <li><strong>Withdraw consent:</strong> at any time, as described in <a href="#consent">section 4</a>.</li>
  <li><strong>Grievance redressal:</strong> complain to our Grievance Officer and, if you are not satisfied with the response, to the Data Protection Board of India.</li>
  <li><strong>Nominate someone:</strong> name another person to exercise your rights on your behalf if you die or become unable to do so.</li>
</ul>
<p>To use these rights, email our Grievance Officer at <a href="{grievance_mailto}">{grievance_email}</a> from the email address linked to your account, or tell us the phone number you signed up with. To protect your account, we will confirm your identity before acting, and we will respond within the time the law requires. The law also expects you to give accurate information, not to impersonate anyone, and not to make false or frivolous complaints.</p>
<p>You can also: choose which optional details to show using your profile's visibility settings, remove optional details at any time, turn off location, microphone and camera permissions in your phone's settings, and block or report anyone.</p>

<h2 id="children">10. Children</h2>
<p>{app} is only for adults aged 18 or over. We do not knowingly collect personal data from anyone under 18. If we learn that a user is under 18, we delete their account and data. If you believe a child is using {app}, please report them in the app or email <a href="{grievance_mailto}">{grievance_email}</a>.</p>

<h2 id="ai">11. Tina and other AI features</h2>
<ul>
  <li>Tina's replies, her voice, our match suggestions and the chat helpers (ice-breakers and reply suggestions) are generated by AI. To create them, we send relevant information, such as profile details, preferences and the recent conversation, to our AI providers (OpenAI for text and ElevenLabs for voice). When you or the person you are chatting with asks for reply suggestions, the last few messages of that chat are included. Our providers process this information to provide their service to us under their business terms.</li>
  <li>Please don't share sensitive information with Tina, such as login codes, bank or card details, ID numbers or health information.</li>
  <li>AI-generated content can be wrong. If a reply is offensive, harmful or inaccurate, report it with the flag icon or by long-pressing the message, or with the flag button during a voice call.</li>
</ul>

<h2 id="changes">12. Changes to this policy</h2>
<p>We may update this policy from time to time. If we make significant changes, we will tell you in the app before they take effect and, where the law requires, ask for your consent again. The effective date at the top of this page shows when it was last updated.</p>

<h2 id="contact">13. Contact us and our Grievance Officer</h2>
<div class="card">
  <dl>
    <dt>Company</dt><dd>{company}, {address}</dd>
    <dt>Support</dt><dd><a href="{support_mailto}">{support_email}</a></dd>
    <dt>Grievance Officer</dt><dd>{grievance_name}, <a href="{grievance_mailto}">{grievance_email}</a></dd>
  </dl>
</div>
<p>We acknowledge complaints within 24 hours and aim to resolve them within 15 days. If you are not satisfied with our response, you can complain to the Data Protection Board of India about how we handle your personal data, or appeal to the Grievance Appellate Committee (<a href="https://gac.gov.in">gac.gov.in</a>) about a decision under the Information Technology Rules.</p>
"""


# ----------------------------------------------------------------------
# Delete account
# ----------------------------------------------------------------------

_DELETE = """
<h1>Delete your {app} account</h1>
<p>You can delete your {app} account and the personal data linked to it at any time.</p>

<h2 id="in-app">Delete it in the app (fastest)</h2>
<ol>
  <li>Open {app} and sign in.</li>
  <li>Go to <strong>Profile</strong>.</li>
  <li>Tap <strong>Delete account</strong> and confirm.</li>
</ol>
<p>Your account is deleted straight away and you are signed out. This can't be undone. Uninstalling the app does <strong>not</strong> delete your account.</p>

<h2 id="request">Can't use the app? Ask us to delete it</h2>
<p>Enter the phone number or email address you used to sign up. We will confirm that the account belongs to you (we may contact you at the phone number or email address you enter) and then delete it within 30 days. We only use these details to handle your request.</p>
<form id="deletion-form" hidden novalidate>
  <label for="deletion-contact">Phone number or email you signed up with</label>
  <input id="deletion-contact" name="contact" type="text" inputmode="email" autocomplete="email" required minlength="3" maxlength="100" placeholder="e.g. +91 98765 43210 or you@example.com">
  <label for="deletion-reason">Reason (optional)</label>
  <textarea id="deletion-reason" name="reason" maxlength="500" rows="3"></textarea>
  <button id="deletion-submit" type="submit">Request account deletion</button>
  <p id="deletion-status" class="status" role="status" aria-live="polite"></p>
</form>
<p>Prefer email? Write to <a href="{deletion_mailto}">{support_email}</a> with the subject "Account deletion request" and the phone number or email address you signed up with.</p>

<h2 id="deleted">What we delete</h2>
<ul>
  <li>Your account and login details (your phone number or Google account details) and all your active sessions.</li>
  <li>Your profile: name, date of birth, gender, preferences, bio, photos (including the image files), optional details and location.</li>
  <li>Your movie preferences, swipes, ratings, library and filters.</li>
  <li>Your matches, conversations and messages. Conversations are removed for the other person too.</li>
  <li>Your conversations with Tina, your personality profile, and the reports you made about Tina's replies.</li>
  <li>Your blocks, and blocks involving your account.</li>
  <li>The copies of your activity in our analytics database.</li>
</ul>

<h2 id="kept">What we may keep</h2>
<ul>
  <li><strong>Safety records:</strong> reports made by you or about you, the action we took, and your answers when we asked whether you met someone. We keep these for as long as needed to keep the community safe, handle disputes and meet legal obligations.</li>
  <li><strong>Backups:</strong> copies of deleted data can stay in our backups for up to 90 days before they are overwritten.</li>
  <li><strong>Legal records:</strong> information the law requires us to keep, for as long as it requires.</li>
  <li><strong>Your request:</strong> if you used the form or emailed us, a record of your request so that we can show we handled it.</li>
</ul>
<p>If you signed in with Google, you can also remove {app}'s access to your Google account at <a href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</a>.</p>
<p>Questions? See our <a href="/legal/privacy#retention">Privacy Policy</a> or <a href="/legal/contact">contact us</a>.</p>
"""


# ----------------------------------------------------------------------
# Contact
# ----------------------------------------------------------------------

_CONTACT = """
<h1>Contact &amp; support</h1>
<p>We're here to help with your account, safety concerns and privacy questions.</p>

<div class="card">
  <h2 id="support">Support</h2>
  <p>Email <a href="{support_mailto}">{support_email}</a>. We usually reply within 1&ndash;2 working days.</p>
  <p>To report a person, a chat or one of Tina's replies, use Report in the app. It's the fastest way, and we aim to review reports within 24 hours. See <a href="/legal/guidelines#report">how to report and block</a>.</p>
</div>

<div class="card">
  <h2 id="grievance">Grievance Officer</h2>
  <p>Appointed under the Information Technology Act, 2000, the Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021 and the Digital Personal Data Protection Act, 2023.</p>
  <dl>
    <dt>Name</dt><dd>{grievance_name}</dd>
    <dt>Email</dt><dd><a href="{grievance_mailto}">{grievance_email}</a></dd>
    <dt>Address</dt><dd>{company}, {address}</dd>
  </dl>
  <p>We acknowledge complaints within 24 hours and resolve them within 15 days of receiving them. Please include your name, the phone number or email address of your {app} account, what your complaint is about and, for content, the profile name or where you saw it, with screenshots if you have them.</p>
  <p>If you're not satisfied with the outcome, you can appeal to the Grievance Appellate Committee at <a href="https://gac.gov.in">gac.gov.in</a> within 30 days, or complain to the Data Protection Board of India about how we handle your personal data.</p>
</div>

<div class="card">
  <h2 id="company">Company</h2>
  <p>{app} is operated by {company}.<br>Registered office: {address}</p>
</div>

<div class="card">
  <h2 id="emergencies">In an emergency</h2>
  <p>We can't respond to emergencies. If you or someone else is in immediate danger, call <strong>112</strong>.</p>
  <ul>
    <li>Online fraud (National Cyber Crime Helpline): <strong>1930</strong> or <a href="https://cybercrime.gov.in">cybercrime.gov.in</a></li>
    <li>Women's helpline: <strong>181</strong></li>
    <li>Childline: <strong>1098</strong></li>
    <li>Tele-MANAS mental health support: <strong>14416</strong></li>
  </ul>
</div>
"""


# ----------------------------------------------------------------------
# Routes
# ----------------------------------------------------------------------

@_route("/legal")
async def legal_index() -> HTMLResponse:
    return _page("/legal", "Legal &amp; support", _INDEX)


@_route("/legal/terms")
async def legal_terms() -> HTMLResponse:
    return _page("/legal/terms", "Terms of Use", _TERMS)


@_route("/legal/privacy")
async def legal_privacy() -> HTMLResponse:
    return _page("/legal/privacy", "Privacy Policy", _PRIVACY)


@_route("/legal/guidelines")
async def legal_guidelines() -> HTMLResponse:
    return _page("/legal/guidelines", "Community Guidelines", _GUIDELINES)


@_route("/legal/delete-account")
async def legal_delete_account() -> HTMLResponse:
    return _page("/legal/delete-account", "Delete your account", _DELETE, script=_DELETE_FORM_JS)


@_route("/legal/contact")
async def legal_contact() -> HTMLResponse:
    return _page("/legal/contact", "Contact &amp; support", _CONTACT)
