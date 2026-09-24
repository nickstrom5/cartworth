"""Builds marketing/Cartworth-launch-checklist.pdf.

The checklist's content lives in CONTENT below; edit it and run:
    python3 marketing/checklist/build_checklist.py
Needs reportlab (pip install reportlab).
"""
from pathlib import Path

from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (BaseDocTemplate, Flowable, Frame, KeepTogether, PageTemplate, Paragraph, Spacer, Table,
                                TableStyle)

UPDATED = 'September 24, 2026'
OUT = Path(__file__).resolve().parents[1] / 'Cartworth-launch-checklist.pdf'

GREEN = HexColor('#1a7f3c')
DARK_GREEN = HexColor('#17622f')
TINT = HexColor('#eef7f0')
INK = HexColor('#1f2328')
GREY = HexColor('#555c63')
RULE = HexColor('#d9dde1')

INTRO = (
    '<b>Where things stand.</b> The iPhone app, the website and the marketing site are built and heavily tested '
    '(449 web tests passing, including 13 browser tests; the iOS suite needs a re-run on your Mac). The pricing fixes '
    'from the last round are in. The prices are <b>not ship-ready yet</b>: what is left is a hand-check of every '
    '"best price" result across Chicago, Lombard, Milwaukee and Kenosha, on the web and on the iPhone. Nothing goes to '
    'the App Store until that check passes. Everything not on this list, Claude is handling.'
)

# (heading, subtitle, [(title, detail, cost/time)])
CONTENT = [
    ('1. Start now: these take the longest', 'Each one blocks something later. Do them first even though they are not exciting.', [
        ('Decide on the price-data question, ideally with a lawyer',
         "Cartworth reads prices from Instacart, Flipp, Whole Foods, Trader Joe's and ALDI without an agreement. For a paid "
         "app, Apple guideline 5.2.2 requires permission to use a third-party service's content, and it is your biggest "
         'legal exposure. Read their terms of use, then get advice before charging money.',
         'Biggest risk to launch'),
        ('Enroll in the Apple Developer Program as an individual',
         'developer.apple.com/programs/enroll. Your name (Nicholas Soderstrom) shows as the seller. Showing "Cartworth" '
         'instead needs an LLC and a D-U-N-S number, which takes weeks.',
         '$99 a year<br/>1 to 2 days'),
        ('Activate the Paid Apps Agreement, banking and tax',
         'App Store Connect, then Business (Agreements, Tax, and Banking). Accept the Paid Apps Agreement, add your bank '
         'account and the W-9. Until this is active, in-app purchases cannot be tested at all, even in the sandbox.',
         '30 minutes<br/>plus Apple review'),
        ('Search the trademark "Cartworth"',
         "tmsearch.uspto.gov, especially classes 9 (software), 35 (price comparison) and 42 (online services). The agents "
         "were blocked by the site's firewall, so this has never actually been checked. A trademark attorney's search is "
         'cheap insurance.',
         '1 hour<br/>or ~$500 with a lawyer'),
    ]),
    ('2. This week: quick ones', None, [
        ('Get free Kroger developer keys',
         "developer.kroger.com: create an account, register an application, and copy its client ID and secret into "
         "Cartworth's Settings. This gives real shelf and card prices for Mariano's and Pick 'n Save instead of their "
         'Instacart listings, which run above the shelf. Read the API terms while you are there.',
         'Free<br/>20 minutes'),
        ('Let the cloud sessions reach the store sites, or run the price check on your Mac',
         "The final price check reads live prices, and the cloud environment's network settings block Instacart, Whole "
         "Foods, Trader Joe's and Flipp. Either add those sites to the environment's allowed domains, or have Claude run "
         'the check (and the iOS tests) on your Mac.',
         '5 minutes'),
        ('Set up support@cartworth.app',
         'Cloudflare dashboard, cartworth.app, Email, Email Routing, forward to your Gmail. Then send it a test email. It '
         'is printed on six pages and App Review checks that it works.',
         'Free<br/>10 minutes'),
        ('Pick a host for the free web app and create the account',
         'Fly.io, Render, Railway or a small VPS. It needs Node 24 and a persistent disk. Tell Claude which one; Claude '
         'writes the configuration. The marketing site goes on Cloudflare Pages, where your domain already is.',
         '~$5 to $10 a month'),
        ('Give the go-ahead to publish the website',
         'Claude prepares both deploys. Publishing is your call because it makes the site public.',
         'A "yes"'),
        ('Verify the site with Google Search Console and Bing Webmaster Tools',
         'After the site is live. Each gives you a verification record or link to approve; Claude submits the sitemap.',
         '15 minutes'),
    ]),
    ('3. Social media', 'A full plan with verified draft posts is being written now. Your part:', [
        ('Claim the handles',
         'Create the accounts on the platforms the plan recommends, and claim "cartworth" everywhere else even if you '
         'never post there. Claude cannot create accounts for you.',
         '30 minutes'),
        ('Decide how you want to show up',
         'On camera or not (it changes which platforms make sense), and how many hours a week you can realistically give it.',
         'A decision'),
    ]),
    ('4. App Store submission', 'After Apple enrollment (section 1) and after the price check passes.', [
        ('Sign in to Xcode with your Apple ID',
         'Xcode, Settings, Accounts. This lets builds be signed and uploaded to TestFlight.',
         '5 minutes'),
        ('Create the app record in App Store Connect',
         'Name Cartworth, bundle ID app.cartworth.ios. Claude drafts the description, keywords, privacy answers, age '
         'rating and review notes for you to paste in.',
         '30 minutes'),
        ('Create the three purchase options, with these exact IDs',
         'app.cartworth.ios.pro.monthly ($3.99), app.cartworth.ios.pro.yearly ($19.99), both in one subscription group; '
         'and app.cartworth.ios.pro.lifetime ($29.99, one-time purchase). They must match the app exactly.',
         '45 minutes'),
        ('Install from TestFlight and make a sandbox purchase on your own iPhone',
         'The first time a real purchase is tried end to end. Also try it on an iPad if you can borrow one.',
         '1 hour'),
        ('Give the final go-ahead to submit for review',
         'Claude will not submit without your explicit yes.',
         'A "yes"'),
    ]),
    ('5. Decisions only you can make', "Claude's recommendation is in brackets.", [
        ('Where the free web app lives',
         '[app.cartworth.app. It cannot sit under cartworth.app/app/ without rework, because the app loads its code from '
         'root paths.]',
         ''),
        ('Pages for search traffic',
         'The site is four pages, too thin to rank for anything but the name. City and store pages ("cheapest groceries '
         'in Milwaukee") would change that. [Yes, after launch.]',
         ''),
        ('"More than seventy chains" on the site',
         'The real number is 94 chains with prices out of 119 in the catalog. Understating is the safe side. [Say 90+.]',
         ''),
        ('A weekly automatic wrong-price sweep',
         'Retailers change their data without warning. [Yes, as a scheduled task across your four ZIPs.]',
         ''),
        ('The daily price tracker',
         'Built and not switched on. It runs 2 to 2.8 hours a day on your Mac, at the same one-request-at-a-time pace as '
         'the app, and writes about 3 GB a year to Google Drive. Installing it is one command (see ops/launchd). '
         '[Yes, if the Mac is usually on overnight.]',
         'A decision'),
    ]),
    ('6. Around Thanksgiving', None, [
        ('Nov 16 to 20: say "go" on a second Thanksgiving test',
         'Today no store has turkey deals or fresh cranberries in stock, so the most important check (that a genuinely '
         'cheap 37 cents/lb turkey is not flagged as an error) could only be simulated. Thanksgiving is Thursday, '
         'November 26.',
         'A "go"'),
        ('Test on real devices',
         "Your iPhone, and an iPad if possible. The simulator cannot show the iPhone Duo's inner screen at all.",
         '1 hour'),
    ]),
]

H2 = ParagraphStyle('h2', fontName='Helvetica-Bold', fontSize=15, leading=19, textColor=DARK_GREEN, spaceBefore=10, spaceAfter=1)
SUB = ParagraphStyle('sub', fontName='Helvetica', fontSize=8.5, leading=11, textColor=GREY, spaceAfter=6)
TITLE = ParagraphStyle('t', fontName='Helvetica-Bold', fontSize=10.5, leading=13, textColor=INK)
BODY = ParagraphStyle('b', fontName='Helvetica', fontSize=8.8, leading=11.6, textColor=GREY)
SIDE = ParagraphStyle('s', fontName='Helvetica', fontSize=8.8, leading=11.6, textColor=DARK_GREEN)
INTRO_STYLE = ParagraphStyle('i', fontName='Helvetica', fontSize=9.4, leading=13, textColor=INK)


class Box(Flowable):
    """The empty checkbox at the start of each row."""

    def wrap(self, *_):
        return 12, 12

    def draw(self):
        self.canv.setStrokeColor(GREEN)
        self.canv.setLineWidth(1.4)
        self.canv.roundRect(0, 0, 11, 11, 2, stroke=1, fill=0)


def item(title, detail, side, last):
    t = Table(
        [[Box(), [Paragraph(title, TITLE), Paragraph(detail, BODY)], Paragraph(side, SIDE) if side else '']],
        colWidths=[0.38 * inch, 4.9 * inch, 1.7 * inch], hAlign='LEFT',
    )
    style = [
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (0, 0), 7),
    ]
    if not last:
        style.append(('LINEBELOW', (1, 0), (-1, 0), 0.6, RULE))
    t.setStyle(TableStyle(style))
    return t


def intro():
    t = Table([[Paragraph(INTRO, INTRO_STYLE)]], colWidths=[7 * inch], hAlign='LEFT')
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), TINT),
        ('LINEBEFORE', (0, 0), (0, -1), 3, GREEN),
        ('LEFTPADDING', (0, 0), (-1, -1), 12),
        ('RIGHTPADDING', (0, 0), (-1, -1), 12),
        ('TOPPADDING', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 12),
    ]))
    return t


def header(canv, doc):
    w, h = letter
    canv.saveState()
    if doc.page == 1:
        canv.setFillColor(GREEN)
        canv.rect(0, h - 1.12 * inch, w, 1.12 * inch, stroke=0, fill=1)
        canv.setFillColor(HexColor('#ffffff'))
        canv.setFont('Helvetica-Bold', 24)
        canv.drawString(0.75 * inch, h - 0.62 * inch, 'Cartworth: your launch checklist')
        canv.setFont('Helvetica', 11)
        canv.drawString(0.75 * inch, h - 0.9 * inch, f'Only the things that need you. Everything else, Claude is doing. Updated {UPDATED}.')
    canv.setFillColor(GREY)
    canv.setFont('Helvetica', 7.5)
    canv.drawString(0.75 * inch, 0.5 * inch, f'Cartworth launch checklist  |  updated {UPDATED}')
    canv.drawRightString(letter[0] - 0.75 * inch, 0.5 * inch, f'Page {doc.page}')
    canv.restoreState()


def build():
    doc = BaseDocTemplate(str(OUT), pagesize=letter, title='Cartworth launch checklist', author='Nicholas Soderstrom',
                          subject='What the owner needs to do to launch Cartworth')
    first = Frame(0.75 * inch, 0.8 * inch, 7 * inch, letter[1] - 2.05 * inch, id='first')
    later = Frame(0.75 * inch, 0.8 * inch, 7 * inch, letter[1] - 1.4 * inch, id='later')
    doc.addPageTemplates([PageTemplate('first', [first], onPage=header, autoNextPageTemplate='later'),
                          PageTemplate('later', [later], onPage=header)])
    story = [intro(), Spacer(1, 8)]
    for heading, sub, rows in CONTENT:
        head = [Paragraph(heading, H2)] + ([Paragraph(sub, SUB)] if sub else [Spacer(1, 4)])
        for i, (title, detail, side) in enumerate(rows):
            row = item(title, detail, side, i == len(rows) - 1)
            # Keep a heading with its first row, so no section starts at the foot of a page.
            story.append(KeepTogether(head + [row]) if i == 0 else row)
    doc.build(story)
    print(f'wrote {OUT}')


if __name__ == '__main__':
    build()
