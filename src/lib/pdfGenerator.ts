// Dynamic import

export const pdfGenerator = {
  async generateAcceptanceLetter(application: {
    application_number: string
    full_name: string
    program: string
    intake: string
    institution: string
  }): Promise<Blob> {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF()
    
    // Header
    doc.setFontSize(20)
    doc.setFont('helvetica', 'bold')
    doc.text('ACCEPTANCE LETTER', 105, 30, { align: 'center' })
    
    // Institution
    doc.setFontSize(12)
    doc.setFont('helvetica', 'normal')
    const institutionName = application.institution === 'KATC' 
      ? 'Kalulushi Training Centre'
      : 'Mukuba Institute of Health and Allied Sciences'
    doc.text(institutionName, 105, 40, { align: 'center' })
    
    // Date
    doc.setFontSize(10)
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 20, 60)
    
    // Application Number
    doc.text(`Application Number: ${application.application_number}`, 20, 70)
    
    // Body
    doc.setFontSize(11)
    doc.text(`Dear ${application.full_name},`, 20, 90)
    
    const bodyText = [
      'We are pleased to inform you that your application has been approved.',
      '',
      `Program: ${application.program}`,
      `Intake: ${application.intake}`,
      '',
      'Congratulations on your acceptance! Please proceed with the enrollment process',
      'as outlined in the student portal.',
      '',
      'We look forward to welcoming you to our institution.',
      '',
      'Sincerely,',
      'Admissions Office'
    ]
    
    let yPos = 100
    bodyText.forEach(line => {
      doc.text(line, 20, yPos)
      yPos += 7
    })
    
    // Footer
    doc.setFontSize(8)
    doc.text('This is a system-generated document.', 105, 280, { align: 'center' })
    
    return doc.output('blob')
  },

  async generateFinanceReceipt(application: {
    application_number: string
    full_name: string
    program: string
    application_fee: number
    paid_amount: number
    payment_method?: string
    paid_at?: string
  }): Promise<Blob> {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF()
    
    // Header
    doc.setFontSize(20)
    doc.setFont('helvetica', 'bold')
    doc.text('PAYMENT RECEIPT', 105, 30, { align: 'center' })
    
    // Receipt Number
    doc.setFontSize(10)
    doc.text(`Receipt No: ${application.application_number}-${Date.now()}`, 20, 50)
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 20, 57)
    
    // Student Details
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text('Student Details', 20, 75)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.text(`Name: ${application.full_name}`, 20, 85)
    doc.text(`Application Number: ${application.application_number}`, 20, 92)
    doc.text(`Program: ${application.program}`, 20, 99)
    
    // Payment Details
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text('Payment Details', 20, 115)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.text(`Application Fee: K${application.application_fee}`, 20, 125)
    doc.text(`Amount Paid: K${application.paid_amount || 0}`, 20, 132)
    doc.text(`Payment Method: ${application.payment_method || 'N/A'}`, 20, 139)
    if (application.paid_at) {
      doc.text(`Payment Date: ${new Date(application.paid_at).toLocaleDateString()}`, 20, 146)
    }
    
    // Status
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    const status = (application.paid_amount || 0) >= application.application_fee ? 'PAID IN FULL' : 'PARTIAL PAYMENT'
    doc.text(status, 105, 170, { align: 'center' })
    
    // Footer
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.text('This is a system-generated receipt. No signature required.', 105, 280, { align: 'center' })
    
    return doc.output('blob')
  }
}
