const path = require("path");
const eSignSdk = require("docusign-esign");
const fs = require("fs");
const { checkToken } = require("./jwtController");
const errorText = require("../assets/errorText.json");

const docsPath = path.resolve(__dirname, "../documents");
const docFile = "Purchase_New_Device.pdf";
/**
 * Controller that creates and sends an envelope to the signer.
 */
const createController = async (req, res) => {
  // Check the access token, which will also update the token
  // if it is expired
  await checkToken(req);
  // Construct arguments
  const { body } = req;
  const envelopeArgs = {
    signerEmail: body.signerEmail,
    signerName: body.signerName,
    status: "sent",
    docFile: path.resolve(docsPath, docFile),

    // Payments
    gatewayAccountId: process.env.PAYMENT_GATEWAY_ACCOUNT_ID,
    gatewayName: process.env.PAYMENT_GATEWAY_NAME,
    gatewayDisplayName: process.env.PAYMENT_GATEWAY_DISPLAY_NAME,

    signerPhoneSelection: body.signerPhoneSelection,
    signerInsuranceSelection: body.signerInsuranceSelection,
    signerDownPayment: body.signerDownPayment,
  };
  const args = {
    accessToken: req.session.accessToken,
    basePath: req.session.basePath,
    accountId: req.session.accountId,
    envelopeArgs: envelopeArgs,
  };
  let results = null;

  // Before doing anything with envelopes
  // first make sure the .env variables are set up
  try {
    if (
      !process.env.PAYMENT_GATEWAY_ACCOUNT_ID ||
      process.env.PAYMENT_GATEWAY_ACCOUNT_ID ==
        "{YOUR_PAYMENT_GATEWAY_ACCOUNT_ID}" ||
      !process.env.PAYMENT_GATEWAY_NAME ||
      !process.env.PAYMENT_GATEWAY_DISPLAY_NAME
    ) {
      throw error;
    }
  } catch (error) {
    throw new Error(errorText.api.paymentConfigsUndefined);
  }

  // Send the envelope to signer
  try {
    results = await sendEnvelope(args);
  } catch (error) {
    console.log("Error sending the envelope."); // ######## Error here
    console.log(error);
    throw new Error("Error sending envelope in PurchaseDeviceController.");
  }

  if (results) {
    req.session.envelopeId = results.envelopeId;
    res.status(200).send("Envelope Successfully Sent!");
  }
};

const sendEnvelope = async (args) => {
  // Data for this method
  // args.basePath
  // args.accessToken
  // args.accountId
  let eSignApi = new eSignSdk.ApiClient();
  eSignApi.setBasePath(args.basePath);
  eSignApi.addDefaultHeader("Authorization", "Bearer " + args.accessToken);
  let envelopesApi = new eSignSdk.EnvelopesApi(eSignApi),
    results = null;

  // Step 1. Make the envelope request body
  let envelope = makeEnvelope(args.envelopeArgs);

  // Step 2. call Envelopes::create API method
  // Exceptions will be caught by the calling function
  results = await envelopesApi.createEnvelope(args.accountId, {
    envelopeDefinition: envelope,
  });

  let envelopeId = results.envelopeId;
  console.log(`Envelope was created. EnvelopeId ${envelopeId}`);

  return { envelopeId: envelopeId };
};

/**
 * Creates envelope definition with remote signing.
 */
function makeEnvelope(args) {
  // Data for this method
  // args.signerEmail
  // args.signerName
  // args.docFile
  // args.status
  // args.signerPhoneSelection
  // args.gatewayAccountId
  // args.gatewayName
  // args.gatewayDisplayName

  // Map all of the phone options to prices
  let signerPhonePrice = 0;
  switch (args.signerPhoneSelection) {
    case "iPhone 13 128GB":
      signerPhonePrice = 799;
    case "iPhone 13 Pro 128GB":
      signerPhonePrice = 999;
    case "iPhone 13 Pro Max 128GB":
      signerPhonePrice = 1099;
    case "Samsung Galaxy S22 Ultra 128GB":
      signerPhonePrice = 1199;
    case "Google Pixel 6 Pro 128GB":
      signerPhonePrice = 899;
  }

  let insuranceSelected = args.signerInsuranceSelection === "Yes" ? 240 : 0;

  // Read and create document from file in the local directory
  let docPdfBytes = fs.readFileSync(args.docFile);
  let docb64 = Buffer.from(docPdfBytes).toString("base64");
  let doc = new eSignSdk.Document.constructFromObject({
    documentBase64: docb64,
    name: "Purchase Device Sample", // can be different from actual file name
    fileExtension: "pdf",
    documentId: "1",
  });

  // Create the envelope definition
  let env = new eSignSdk.EnvelopeDefinition();
  env.emailSubject = "Purchase New Device: Subject";

  // Add the document to the envelope
  env.documents = [doc];

  // Create a signer recipient to sign the document, identified by name and email
  let signer = eSignSdk.Signer.constructFromObject({
    email: args.signerEmail,
    name: args.signerName,
    recipientId: "1",
  });

  // Create signHere fields (also known as tabs) on the documents,
  // We're using anchor (autoPlace) positioning
  let signTerms = eSignSdk.InitialHere.constructFromObject({
    anchorString: "/sn1/",
    anchorUnits: "pixels",
    anchorXOffset: "10",
    anchorIgnoreIfNotPresent: "false",
  });

  let signBuyer = eSignSdk.SignHere.constructFromObject({
    anchorString: "/sn2/",
    anchorUnits: "pixels",
    anchorXOffset: "10",
    anchorIgnoreIfNotPresent: "false",
  });

  let fullName = eSignSdk.FullName.constructFromObject({
    anchorString: "/sn3/",
    anchorUnits: "pixels",
    anchorXOffset: "10",
    anchorIgnoreIfNotPresent: "false",
  });
  let date = eSignSdk.DateSigned.constructFromObject({
    anchorString: "/date/",
    anchorUnits: "pixels",
    anchorXOffset: "10",
    anchorIgnoreIfNotPresent: "false",
  });

  let buyerAddress = eSignSdk.Text.constructFromObject({
    anchorString: "/adr/",
    anchorUnits: "pixels",
    anchorYOffset: "15",
    anchorXOffset: "-35",
    anchorIgnoreIfNotPresent: "false",
    width: 150,
    height: 80,
  });

  // BALANCES

  let itemDescription1 = eSignSdk.Text.constructFromObject({
    anchorString: "/itemdesc1/",
    anchorIgnoreIfNotPresent: "false",
    value: args.signerPhoneSelection,
    locked: "true",
  });

  let itemDescription2 = eSignSdk.Text.constructFromObject({
    anchorString: "/itemdesc2/",
    anchorIgnoreIfNotPresent: "false",
    value: insuranceSelected ? "Insurance" : "",
    locked: "true",
  });

  let price1 = eSignSdk.Text.constructFromObject({
    anchorString: "/price1/",
    anchorIgnoreIfNotPresent: "false",
    value: "$" + signerPhonePrice,
    locked: "true",
  });

  let price2 = eSignSdk.Text.constructFromObject({
    anchorString: "/price2/",
    anchorIgnoreIfNotPresent: "false",
    value: insuranceSelected ? "$240/24 months" : "",
    locked: "true",
  });

  let price3 = eSignSdk.Text.constructFromObject({
    anchorString: "/price3/",
    anchorIgnoreIfNotPresent: "false",
    value: "$" + (insuranceSelected + signerPhonePrice),
    locked: "true",
  });

  let downPayment1 = eSignSdk.Text.constructFromObject({
    anchorString: "/dpay1/",
    anchorIgnoreIfNotPresent: "false",
    value: "$" + args.signerDownPayment,
    locked: "true",
  });

  let downPayment2 = eSignSdk.Text.constructFromObject({
    anchorString: "/dpay2/",
    anchorIgnoreIfNotPresent: "false",
    value: "$" + args.signerDownPayment,
    locked: "true",
  });

  let balance1 = eSignSdk.Text.constructFromObject({
    anchorString: "/bal1/",
    anchorIgnoreIfNotPresent: "false",
    value: "$" + (signerPhonePrice - args.signerDownPayment),
    locked: "true",
  });

  let balance2 = eSignSdk.Text.constructFromObject({
    anchorString: "/bal2/",
    anchorIgnoreIfNotPresent: "false",
    value: "$" + insuranceSelected,
    locked: "true",
  });

  let balance3 = eSignSdk.Text.constructFromObject({
    anchorString: "/bal3/",
    anchorIgnoreIfNotPresent: "false",
    value:
      "$" + (signerPhonePrice - args.signerDownPayment + insuranceSelected),
    locked: "true",
  });

  let amountPayments = eSignSdk.Text.constructFromObject({
    anchorString: "/amntpay/",
    anchorIgnoreIfNotPresent: "false",
    value:
      "$" +
      (
        (signerPhonePrice - args.signerDownPayment + insuranceSelected) /
        24.0
      ).toFixed(2),
    locked: "true",
  });
  /////////////

  // Tabs are set per recipient / signer
  let signerTabs = eSignSdk.Tabs.constructFromObject({
    initialHereTabs: [signTerms],
    signHereTabs: [signBuyer],
    fullNameTabs: [fullName],
    textTabs: [
      buyerAddress,
      itemDescription1,
      itemDescription2,
      price1,
      price2,
      price3,
      downPayment1,
      downPayment2,
      balance1,
      balance2,
      balance3,
      amountPayments,
    ],
    dateSignedTabs: [date],
  });
  signer.tabs = signerTabs;

  // Add the recipient to the envelope object
  let recipients = eSignSdk.Recipients.constructFromObject({
    signers: [signer],
  });
  env.recipients = recipients;

  // Request that the envelope be sent by setting |status| to "sent".
  // To request that the envelope be created as a draft, set to "created"
  env.status = args.status;

  return env;
}

module.exports = { createController };
