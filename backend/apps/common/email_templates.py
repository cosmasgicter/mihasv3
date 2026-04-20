"""Shared base email template for all MIHAS outbound emails."""


def get_base_email_html(content_html: str, title: str = "") -> str:
    """Wrap content in a premium, mobile-responsive email template."""
    title_block = ""
    if title:
        title_block = (
            '<tr><td style="padding:24px 32px 0 32px;font-family:Arial,Helvetica,sans-serif;'
            f'font-size:20px;font-weight:700;color:#1a365d;">{title}</td></tr>'
        )

    return f"""\
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN"
  "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>{title or 'MIHAS'}</title>
</head>
<body style="margin:0;padding:0;background-color:#f0f4f8;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f4f8;">
<tr><td align="center" style="padding:24px 16px;">

<!-- Outer container -->
<table role="presentation" width="600" cellpadding="0" cellspacing="0"
  style="max-width:600px;width:100%;background-color:#ffffff;border-radius:8px;
         box-shadow:0 2px 8px rgba(0,0,0,0.06);overflow:hidden;">

  <!-- Header -->
  <tr>
    <td style="background-color:#1a365d;padding:20px 32px;text-align:center;">
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
        <tr>
          <td style="font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:700;
                     color:#ffffff;letter-spacing:1px;">
            MIHAS
          </td>
        </tr>
        <tr>
          <td style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#94a3b8;
                     letter-spacing:0.5px;padding-top:4px;">
            Mukuba Institute of Health &amp; Allied Sciences
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- Title -->
  {title_block}

  <!-- Content -->
  <tr>
    <td style="padding:24px 32px;font-family:Arial,Helvetica,sans-serif;font-size:14px;
               line-height:1.6;color:#334155;">
      {content_html}
    </td>
  </tr>

  <!-- Divider -->
  <tr><td style="padding:0 32px;"><hr style="border:none;border-top:1px solid #e2e8f0;margin:0;" /></td></tr>

  <!-- Footer -->
  <tr>
    <td style="padding:20px 32px;font-family:Arial,Helvetica,sans-serif;font-size:11px;
               color:#94a3b8;line-height:1.5;text-align:center;">
      Mukuba Institute of Health &amp; Allied Sciences<br />
      Kitwe, Zambia &middot;
      <a href="***REMOVED***" style="color:#2563eb;text-decoration:none;">apply.mihas.edu.zm</a><br />
      <span style="font-size:10px;color:#b0b8c4;">
        This is an automated message. Please do not reply directly to this email.
      </span>
    </td>
  </tr>

</table>
<!-- /Outer container -->

</td></tr>
</table>
</body>
</html>"""
