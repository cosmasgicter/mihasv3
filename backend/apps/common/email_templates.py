"""Shared base email template for all MIHAS outbound emails."""


def get_base_email_html(content_html: str, title: str = "") -> str:
    """Wrap content in a polished, premium email shell."""
    title_block = ""
    if title:
        title_block = f"""\
        <tr>
          <td style="padding:0 40px 22px 40px;">
            <div style="font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:1.2;
                        font-weight:700;color:#10233f;letter-spacing:-0.02em;">
              {title}
            </div>
          </td>
        </tr>"""

    preheader = (
        title
        or "Important update from Mukuba Institute of Health and Allied Sciences."
    )

    return f"""\
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN"
  "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>{title or 'MIHAS Admissions'}</title>
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
</head>
<body style="margin:0;padding:0;background-color:#eff4f8;">
<div style="display:none;overflow:hidden;line-height:1px;opacity:0;max-height:0;max-width:0;color:transparent;">
  {preheader}
</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:
  radial-gradient(circle at top, #dbeafe 0%, #eff4f8 38%, #eef2f6 100%);">
  <tr>
    <td align="center" style="padding:28px 14px;">
      <table role="presentation" width="640" cellpadding="0" cellspacing="0"
        class="mihas-shell"
        style="max-width:640px;width:100%;background-color:#fbfdff;border-radius:28px;
               overflow:hidden;box-shadow:0 20px 60px rgba(15,23,42,0.12);">
        <tr>
          <td style="background:
            linear-gradient(135deg, #10233f 0%, #15345d 58%, #1e4f86 100%);
            padding:22px 40px 26px 40px;" class="mihas-pad">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <div style="display:inline-block;padding:7px 12px;border-radius:999px;
                              background-color:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.16);
                              font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;
                              letter-spacing:0.16em;text-transform:uppercase;color:#dbeafe;">
                    MIHAS Admissions
                  </div>
                  <div style="padding-top:16px;font-family:Georgia,'Times New Roman',serif;
                              font-size:29px;line-height:1.16;font-weight:700;color:#ffffff;">
                    Mukuba Institute of Health &amp; Allied Sciences
                  </div>
                </td>
                <td align="right" class="mihas-subcopy"
                    style="font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;
                           color:#c7d8ef;">
                  Kitwe, Zambia<br />
                  Admissions &amp; student communications
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 40px 0 40px;" class="mihas-pad">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
              style="background:linear-gradient(180deg,#f8fbff 0%,#f1f6fb 100%);
                     border:1px solid #d7e4f2;border-radius:20px;">
              <tr>
                <td style="padding:16px 18px;font-family:Arial,Helvetica,sans-serif;font-size:13px;
                           line-height:1.7;color:#44556c;">
                  This message was generated from the MIHAS admissions platform. Please review the details below and
                  keep this communication for your records.
                </td>
              </tr>
            </table>
          </td>
        </tr>
        {title_block}
        <tr>
          <td style="padding:0 40px 34px 40px;" class="mihas-pad">
            <div style="background-color:#ffffff;border:1px solid #e2eaf2;border-radius:22px;
                        padding:28px 26px;font-family:Arial,Helvetica,sans-serif;font-size:15px;
                        line-height:1.75;color:#24364b;">
              {content_html}
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding:0 40px 0 40px;" class="mihas-pad">
            <div style="height:1px;background:linear-gradient(90deg,#d8e6f3 0%,#b6cbdf 50%,#d8e6f3 100%);"></div>
          </td>
        </tr>
        <tr>
          <td style="padding:22px 40px 28px 40px;" class="mihas-pad">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.7;color:#6a7a8d;">
                  <strong style="color:#10233f;">Mukuba Institute of Health &amp; Allied Sciences</strong><br />
                  apply.mihas.edu.zm
                </td>
                <td align="right" style="font-family:Arial,Helvetica,sans-serif;font-size:11px;
                                         line-height:1.7;color:#90a0b4;">
                  Automated communication<br />
                  Please do not reply directly to this email
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>"""
