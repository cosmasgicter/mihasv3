"""Shared email shell for all MIHAS-KATC outbound emails.

Wraps any piece of content HTML in the institutional shell: gradient hero
header, rounded white body card, footer with address and legal line.

Refactored from ``apps/common/email_templates.py``. The old file remains as
a thin re-export shim for one release so existing callers don't break.
"""

from html import escape

from apps.common.email import tokens as t


def render_shell(content_html: str, *, title: str = "", preheader: str = "") -> str:
    """Return a complete, email-client-safe HTML document.

    Parameters
    ----------
    content_html : str
        Pre-rendered body HTML (usually a stack of component outputs).
    title : str
        Rendered as the large serif headline inside the body card.
    preheader : str
        Short snippet shown in the inbox preview. Defaults to a generic line.
    """
    if not preheader:
        preheader = (
            escape(title)
            if title
            else "Important update from Mukuba Institute of Health and Applied Sciences."
        )

    title_block = ""
    if title:
        title_block = f"""
<tr>
  <td style="padding:{t.SPACE_LG} {t.SHELL_PADDING_X} {t.SPACE_SM} {t.SHELL_PADDING_X};"
      class="mihas-pad">
    <div class="mihas-title"
         style="font-family:{t.FONT_DISPLAY};font-size:{t.TYPE_DISPLAY_SIZE};
                line-height:{t.TYPE_DISPLAY_LINE};font-weight:{t.WEIGHT_BOLD};
                color:{t.INK_900};letter-spacing:-0.02em;">
      {escape(title)}
    </div>
  </td>
</tr>""".strip()

    return f"""\
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN"
  "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title>{escape(title) if title else 'MIHAS Admissions'}</title>
<style type="text/css">
  body, table, td, a {{
    -webkit-text-size-adjust: 100%;
    -ms-text-size-adjust: 100%;
  }}
  table, td {{
    mso-table-lspace: 0pt;
    mso-table-rspace: 0pt;
  }}
  img {{
    -ms-interpolation-mode: bicubic;
    border: 0;
    outline: none;
    text-decoration: none;
  }}
  a[x-apple-data-detectors] {{
    color: inherit !important;
    text-decoration: none !important;
  }}
  @media screen and (max-width: 620px) {{
    .mihas-shell {{
      border-radius: 20px !important;
    }}
    .mihas-pad {{
      padding-left: 22px !important;
      padding-right: 22px !important;
    }}
    .mihas-title {{
      font-size: 24px !important;
    }}
    .mihas-subcopy {{
      display: block !important;
      width: 100% !important;
      padding-top: 14px !important;
    }}
  }}
</style>
<!--[if gte mso 9]>
<style type="text/css">
  table {{ border-collapse: collapse; }}
</style>
<![endif]-->
</head>
<body style="margin:0;padding:0;background-color:{t.INK_50};word-spacing:normal;">
<div style="display:none;overflow:hidden;line-height:1px;opacity:0;max-height:0;
            max-width:0;color:transparent;mso-hide:all;">
  {preheader}
  &#8199;&#65279;&#847; &#8199;&#65279;&#847; &#8199;&#65279;&#847;
</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"
       style="background-color:{t.INK_50};">
  <tr>
    <td align="center" style="padding:28px 14px;">
      <!--[if mso]>
      <table role="presentation" width="{t.SHELL_MAX_WIDTH}" cellpadding="0" cellspacing="0" align="center"><tr><td>
      <![endif]-->
      <table role="presentation" cellpadding="0" cellspacing="0"
        class="mihas-shell"
        style="max-width:{t.SHELL_MAX_WIDTH}px;width:100%;background-color:#fbfdff;
               border-radius:{t.RADIUS_XL};overflow:hidden;
               box-shadow:0 20px 60px rgba(15,23,42,0.12);">
        <tr>
          <td style="background-color:{t.HERO_GRADIENT_START};background-image:
            linear-gradient(135deg, {t.HERO_GRADIENT_START} 0%, {t.HERO_GRADIENT_MID} 58%, {t.HERO_GRADIENT_END} 100%);
            padding:{t.SHELL_PADDING_Y} {t.SHELL_PADDING_X} 26px {t.SHELL_PADDING_X};"
              class="mihas-pad">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <div style="display:inline-block;padding:7px 12px;border-radius:999px;
                              background-color:rgba(255,255,255,0.12);
                              border:1px solid rgba(255,255,255,0.16);
                              font-family:{t.FONT_BODY};font-size:11px;
                              font-weight:{t.WEIGHT_BOLD};letter-spacing:0.16em;
                              text-transform:uppercase;color:#dbeafe;">
                    MIHAS Admissions
                  </div>
                  <div style="padding-top:16px;font-family:{t.FONT_DISPLAY};
                              font-size:29px;line-height:1.16;
                              font-weight:{t.WEIGHT_BOLD};color:{t.PAPER};">
                    Mukuba Institute of Health &amp; Applied Sciences
                  </div>
                </td>
                <td align="right" class="mihas-subcopy"
                    style="font-family:{t.FONT_BODY};font-size:12px;line-height:1.6;
                           color:#c7d8ef;">
                  Kalulushi, Zambia<br />
                  Admissions &amp; student communications
                </td>
              </tr>
            </table>
          </td>
        </tr>
        {title_block}
        <tr>
          <td style="padding:{t.SPACE_LG} {t.SHELL_PADDING_X} 34px {t.SHELL_PADDING_X};"
              class="mihas-pad">
            <div style="background-color:{t.PAPER};border:1px solid #e2eaf2;
                        border-radius:{t.RADIUS_LG};padding:28px 26px;
                        font-family:{t.FONT_BODY};
                        font-size:{t.TYPE_BODY_SIZE};
                        line-height:{t.TYPE_BODY_LINE};color:{t.INK_900};">
              {content_html}
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding:0 {t.SHELL_PADDING_X} 0 {t.SHELL_PADDING_X};"
              class="mihas-pad">
            <div style="height:1px;background:{t.INK_300};"></div>
          </td>
        </tr>
        <tr>
          <td style="padding:22px {t.SHELL_PADDING_X} 28px {t.SHELL_PADDING_X};"
              class="mihas-pad">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-family:{t.FONT_BODY};font-size:12px;line-height:1.7;
                           color:#6a7a8d;">
                  <strong style="color:{t.INK_900};">
                    Mukuba Institute of Health &amp; Applied Sciences
                  </strong><br />
                  Plot 1234, Independence Avenue, Kalulushi, Zambia<br />
                  apply.mihas.edu.zm
                </td>
                <td align="right" valign="top"
                    style="font-family:{t.FONT_BODY};font-size:11px;
                           line-height:1.7;color:#90a0b4;">
                  Automated communication<br />
                  Please do not reply directly to this email
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
      <!--[if mso]>
      </td></tr></table>
      <![endif]-->
    </td>
  </tr>
</table>
</body>
</html>"""


# Backward-compat alias for the old function name.
def get_base_email_html(content_html: str, title: str = "") -> str:
    """Deprecated — use ``render_shell`` instead. Kept for one release."""
    return render_shell(content_html, title=title)
