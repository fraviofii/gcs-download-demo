"use client"

import { useState, useEffect } from "react"
import Image from "next/image"
import { ChevronLeft, ChevronRight, Loader2, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

// Hardcoded list of known image filenames
const IMAGE_FILENAMES = ["image1.jpg", "image2.jpg", "image3.jpg", "image4.jpg", "image5.jpg"]

const DIRECTORY_NAME = "gallery" // Your bucket directory name

interface SignedUrlResponse {
  signedUrl: string
  error?: string
  details?: string
}

export default function PhotoGallery() {
  const [selectedImage, setSelectedImage] = useState<string>(IMAGE_FILENAMES[0])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [optimizedUrls, setOptimizedUrls] = useState<Record<string, string>>({})
  const [originalUrl, setOriginalUrl] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [originalLoading, setOriginalLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorDetails, setErrorDetails] = useState<string | null>(null)

  // Fetch signed URL for an image
  const fetchSignedUrl = async (filename: string, original = false): Promise<string> => {
    try {
      setError(null)
      setErrorDetails(null)

      console.log(`Fetching ${original ? "original" : "optimized"} URL for ${filename}`)

      const response = await fetch(
        `/api/signed-url?directory=${DIRECTORY_NAME}&filename=${filename}&original=${original}`,
      )

      console.log(`Response status: ${response.status}`)

      if (!response.ok) {
        const errorText = await response.text()
        console.error(`HTTP error! status: ${response.status}`, errorText)

        // Try to parse as JSON if possible
        try {
          const errorJson = JSON.parse(errorText)
          setError(errorJson.error || `Server error: ${response.status}`)
          if (errorJson.details) {
            setErrorDetails(errorJson.details)
          }
        } catch {
          setError(`Server error: ${response.status} - ${errorText}`)
        }

        return ""
      }

      // Check if response is JSON
      const contentType = response.headers.get("content-type")
      if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text()
        console.error("Non-JSON response:", text)
        setError("Invalid server response format")
        return ""
      }

      const data: SignedUrlResponse = await response.json()

      if (data.error) {
        console.error("Error fetching signed URL:", data.error)
        setError(data.error)
        if (data.details) {
          setErrorDetails(data.details)
        }
        return ""
      }

      console.log(`Successfully got signed URL for ${filename}`)
      return data.signedUrl
    } catch (error) {
      console.error("Error fetching signed URL:", error)
      setError(error instanceof Error ? error.message : "Unknown error occurred")
      return ""
    }
  }

  // Load optimized images for carousel
  useEffect(() => {
    const loadOptimizedImages = async () => {
      setLoading(true)
      console.log("Starting to load optimized images...")
      const urls: Record<string, string> = {}

      for (const filename of IMAGE_FILENAMES) {
        const url = await fetchSignedUrl(filename, false)
        if (url) {
          urls[filename] = url
        }
        // Stop on first error to avoid spamming
        if (error) break
      }

      setOptimizedUrls(urls)
      setLoading(false)
      console.log(`Finished loading optimized images. Got ${Object.keys(urls).length} URLs`)
    }

    loadOptimizedImages()
  }, [])

  // Load original image when selection changes
  useEffect(() => {
    const loadOriginalImage = async () => {
      if (!selectedImage) return

      setOriginalLoading(true)
      const url = await fetchSignedUrl(selectedImage, true)
      setOriginalUrl(url)
      setOriginalLoading(false)
    }

    loadOriginalImage()
  }, [selectedImage])

  const handleImageSelect = (filename: string, index: number) => {
    setSelectedImage(filename)
    setCurrentIndex(index)
  }

  const navigateCarousel = (direction: "prev" | "next") => {
    const newIndex =
      direction === "prev"
        ? (currentIndex - 1 + IMAGE_FILENAMES.length) % IMAGE_FILENAMES.length
        : (currentIndex + 1) % IMAGE_FILENAMES.length

    handleImageSelect(IMAGE_FILENAMES[newIndex], newIndex)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-2">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span>Loading gallery...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <h1 className="text-3xl font-bold text-gray-900">Photo Gallery</h1>
          <p className="text-gray-600 mt-2">Secure image gallery with Google Cloud Storage</p>
        </div>
      </header>

      {/* Error Alert */}
      {error && (
        <div className="max-w-7xl mx-auto px-4 py-4">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Configuration Error</AlertTitle>
            <AlertDescription>
              <div className="space-y-2">
                <p>{error}</p>
                {errorDetails && (
                  <details className="text-xs">
                    <summary className="cursor-pointer font-medium">Technical Details</summary>
                    <pre className="mt-2 whitespace-pre-wrap bg-gray-100 p-2 rounded text-xs overflow-x-auto">
                      {errorDetails}
                    </pre>
                  </details>
                )}
                <div className="mt-3 text-sm">
                  <p className="font-medium">Setup checklist:</p>
                  <ul className="list-disc list-inside mt-1 space-y-1">
                    <li>Set GOOGLE_CLOUD_PROJECT_ID in your .env.local file</li>
                    <li>Set GOOGLE_CLOUD_BUCKET_NAME in your .env.local file</li>
                    <li>Set either GOOGLE_CLOUD_KEY_FILE or GOOGLE_CLOUD_CREDENTIALS</li>
                    <li>Ensure your service account has Storage Object Viewer permissions</li>
                    <li>Verify your bucket structure: bucket/gallery/optimized/ and bucket/gallery/original/</li>
                    <li>Check that your image files exist in both subdirectories</li>
                  </ul>
                </div>
              </div>
            </AlertDescription>
          </Alert>
        </div>
      )}

      {/* Main Image Display Area */}
      <main className="flex-1 p-4 flex items-center justify-center">
        <Card className="max-w-4xl w-full p-6">
          <div className="relative aspect-video bg-gray-100 rounded-lg overflow-hidden">
            {originalLoading ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-8 h-8 animate-spin" />
                  <span>Loading original image...</span>
                </div>
              </div>
            ) : originalUrl ? (
              <Image
                src={originalUrl || "/placeholder.svg"}
                alt={`Original ${selectedImage}`}
                fill
                className="object-contain"
                priority
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-gray-500">
                <span>Failed to load image</span>
              </div>
            )}
          </div>
          <div className="mt-4 text-center">
            <h2 className="text-xl font-semibold text-gray-800">{selectedImage}</h2>
            <p className="text-gray-600">Original resolution</p>
          </div>
        </Card>
      </main>

      {/* Bottom Carousel */}
      <div className="bg-white border-t shadow-lg">
        <div className="max-w-7xl mx-auto p-4">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="icon" onClick={() => navigateCarousel("prev")} className="shrink-0">
              <ChevronLeft className="w-4 h-4" />
            </Button>

            <div className="flex-1 overflow-x-auto">
              <div className="flex gap-4 pb-2">
                {IMAGE_FILENAMES.map((filename, index) => (
                  <div
                    key={filename}
                    className={`relative shrink-0 cursor-pointer transition-all duration-200 ${
                      selectedImage === filename
                        ? "ring-2 ring-blue-500 ring-offset-2"
                        : "hover:ring-2 hover:ring-gray-300 hover:ring-offset-2"
                    }`}
                    onClick={() => handleImageSelect(filename, index)}
                  >
                    <div className="w-24 h-24 bg-gray-100 rounded-lg overflow-hidden">
                      {optimizedUrls[filename] ? (
                        <Image
                          src={optimizedUrls[filename] || "/placeholder.svg"}
                          alt={`Thumbnail ${filename}`}
                          width={96}
                          height={96}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Loader2 className="w-4 h-4 animate-spin" />
                        </div>
                      )}
                    </div>
                    <div className="absolute inset-x-0 bottom-0 bg-black bg-opacity-50 text-white text-xs p-1 rounded-b-lg">
                      <div className="truncate">{filename}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <Button variant="outline" size="icon" onClick={() => navigateCarousel("next")} className="shrink-0">
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
