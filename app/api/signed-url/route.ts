import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const headers = {
    "Content-Type": "application/json",
  }

  try {
    console.log("=== API Route Debug Info ===")
    console.log("NODE_ENV:", process.env.NODE_ENV)
    console.log("GOOGLE_CLOUD_PROJECT_ID:", process.env.GOOGLE_CLOUD_PROJECT_ID ? "SET" : "NOT SET")
    console.log("GOOGLE_CLOUD_BUCKET_NAME:", process.env.GOOGLE_CLOUD_BUCKET_NAME ? "SET" : "NOT SET")
    console.log("GOOGLE_CLOUD_KEY_FILE:", process.env.GOOGLE_CLOUD_KEY_FILE ? "SET" : "NOT SET")
    console.log("GOOGLE_CLOUD_CREDENTIALS:", process.env.GOOGLE_CLOUD_CREDENTIALS ? "SET" : "NOT SET")

    // Check environment variables first
    if (!process.env.GOOGLE_CLOUD_PROJECT_ID) {
      console.error("Missing GOOGLE_CLOUD_PROJECT_ID")
      return NextResponse.json({ error: "Google Cloud project ID not configured" }, { status: 500, headers })
    }

    if (!process.env.GOOGLE_CLOUD_BUCKET_NAME) {
      console.error("Missing GOOGLE_CLOUD_BUCKET_NAME")
      return NextResponse.json({ error: "Google Cloud Storage bucket name not configured" }, { status: 500, headers })
    }

    if (!process.env.GOOGLE_CLOUD_KEY_FILE && !process.env.GOOGLE_CLOUD_CREDENTIALS) {
      console.error("Missing both GOOGLE_CLOUD_KEY_FILE and GOOGLE_CLOUD_CREDENTIALS")
      return NextResponse.json({ error: "Google Cloud credentials not configured" }, { status: 500, headers })
    }

    // Parse request parameters
    const { searchParams } = new URL(request.url)
    const directory = searchParams.get("directory")
    const filename = searchParams.get("filename")
    const original = searchParams.get("original") === "true"

    console.log("Request params:", { directory, filename, original })

    // Validate required parameters
    if (!directory || !filename) {
      console.error("Missing required parameters")
      return NextResponse.json(
        { error: "Missing required parameters: directory and filename" },
        { status: 400, headers },
      )
    }

    // Try to import and initialize Google Cloud Storage
    console.log("Attempting to import @google-cloud/storage...")
    let Storage
    try {
      const storageModule = await import("@google-cloud/storage")
      Storage = storageModule.Storage
      console.log("Successfully imported @google-cloud/storage")
    } catch (importError) {
      console.error("Failed to import @google-cloud/storage:", importError)
      return NextResponse.json({ error: "Google Cloud Storage package not available" }, { status: 500, headers })
    }

    // Initialize storage client
    console.log("Initializing Google Cloud Storage client...")
    let storage
    try {
      const storageConfig: any = {
        projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
      }

      if (process.env.GOOGLE_CLOUD_KEY_FILE) {
        console.log("Using key file authentication")
        storageConfig.keyFilename = process.env.GOOGLE_CLOUD_KEY_FILE
      } else if (process.env.GOOGLE_CLOUD_CREDENTIALS) {
        console.log("Using credentials string authentication")
        try {
          storageConfig.credentials = JSON.parse(process.env.GOOGLE_CLOUD_CREDENTIALS)
        } catch (parseError) {
          console.error("Failed to parse GOOGLE_CLOUD_CREDENTIALS:", parseError)
          return NextResponse.json({ error: "Invalid Google Cloud credentials format" }, { status: 500, headers })
        }
      }

      storage = new Storage(storageConfig)
      console.log("Successfully initialized Google Cloud Storage client")
    } catch (initError) {
      console.error("Failed to initialize Google Cloud Storage:", initError)
      return NextResponse.json(
        {
          error: `Failed to initialize Google Cloud Storage: ${initError instanceof Error ? initError.message : "Unknown error"}`,
        },
        { status: 500, headers },
      )
    }

    // Construct file path
    const subdirectory = original ? "original" : "optimized"
    const filePath = `${directory}/${subdirectory}/${filename}`
    const bucketName = process.env.GOOGLE_CLOUD_BUCKET_NAME

    console.log(`Checking file: gs://${bucketName}/${filePath}`)

    // Get file reference and check existence
    try {
      const file = storage.bucket(bucketName).file(filePath)
      console.log("Created file reference")

      const [exists] = await file.exists()
      console.log(`File exists: ${exists}`)

      if (!exists) {
        console.error(`File not found: ${filePath}`)
        return NextResponse.json({ error: `File not found: ${filePath}` }, { status: 404, headers })
      }

      // Generate signed URL
      console.log("Generating signed URL...")
      const options = {
        version: "v4" as const,
        action: "read" as const,
        expires: Date.now() + 60 * 60 * 1000, // 1 hour from now
      }

      const [signedUrl] = await file.getSignedUrl(options)
      console.log("Successfully generated signed URL")

      // If you have a CDN endpoint configured, replace the storage URL
      const cdnEndpoint = process.env.GOOGLE_CLOUD_CDN_ENDPOINT
      let finalUrl = signedUrl

      if (cdnEndpoint) {
        // Replace the storage.googleapis.com domain with your CDN endpoint
        // while preserving the signed URL parameters
        const url = new URL(signedUrl)
        const pathAndQuery = url.pathname + url.search
        finalUrl = `${cdnEndpoint}${pathAndQuery}`

        console.log(`Using CDN URL: ${finalUrl}`)
      } else {
        console.log(`Using direct storage URL: ${finalUrl}`)
      }

      return NextResponse.json({ signedUrl: finalUrl }, { headers })
    } catch (storageError) {
      console.error("Google Cloud Storage operation failed:", storageError)
      return NextResponse.json(
        {
          error: `Storage operation failed: ${storageError instanceof Error ? storageError.message : "Unknown storage error"}`,
          details: storageError instanceof Error ? storageError.stack : undefined,
        },
        { status: 500, headers },
      )
    }
  } catch (error) {
    console.error("Unexpected error in API route:", error)
    return NextResponse.json(
      {
        error: `Unexpected error: ${error instanceof Error ? error.message : "Unknown error"}`,
        details: error instanceof Error ? error.stack : undefined,
      },
      { status: 500, headers },
    )
  }
}
