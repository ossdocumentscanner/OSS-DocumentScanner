package com.akylas.documentscanner.utils

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ColorMatrixColorFilter
import android.graphics.Paint
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.Bundle
import android.os.CancellationSignal
import android.os.ParcelFileDescriptor
import android.print.PageRange
import android.print.PrintDocumentAdapter
import android.print.PrintDocumentAdapter.LayoutResultCallback
import android.print.PrintDocumentAdapter.WriteResultCallback
import android.print.PrintAttributes
import android.print.PrintDocumentInfo
import android.print.PrintManager
import android.util.Log
import com.itextpdf.io.font.PdfEncodings
import com.itextpdf.io.image.ImageDataFactory
import com.itextpdf.kernel.colors.ColorConstants
import com.itextpdf.kernel.font.PdfFont
import com.itextpdf.kernel.font.PdfFontFactory
import com.itextpdf.kernel.font.PdfFontFactory.EmbeddingStrategy
import com.itextpdf.kernel.geom.PageSize
import com.itextpdf.kernel.geom.Rectangle
import com.itextpdf.kernel.pdf.EncryptionConstants
import com.itextpdf.kernel.pdf.PdfDocument
import com.itextpdf.kernel.pdf.PdfName
import com.itextpdf.kernel.pdf.PdfReader
import com.itextpdf.kernel.pdf.PdfVersion
import com.itextpdf.kernel.pdf.PdfWriter
import com.itextpdf.kernel.pdf.WriterProperties
import com.itextpdf.kernel.pdf.canvas.PdfCanvas
import com.itextpdf.kernel.pdf.canvas.PdfCanvasConstants
import com.itextpdf.kernel.pdf.canvas.parser.EventType
import com.itextpdf.kernel.pdf.canvas.parser.PdfCanvasProcessor
import com.itextpdf.kernel.pdf.canvas.parser.data.IEventData
import com.itextpdf.kernel.pdf.canvas.parser.data.ImageRenderInfo
import com.itextpdf.kernel.pdf.canvas.parser.listener.IEventListener
import com.itextpdf.kernel.pdf.xobject.PdfImageXObject
import com.itextpdf.layout.Document
import com.itextpdf.layout.element.AreaBreak
import com.itextpdf.layout.element.Image
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.IOException
import java.io.InputStream
import java.util.Arrays
import kotlin.concurrent.thread
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min


class PDFUtils {

    class PDFPrintDocumentAdapter(
        private val context: Context,
        private val pdfFilePath: String,
        private val documentName: String
    ) : PrintDocumentAdapter() {

        override fun onLayout(
            oldAttributes: PrintAttributes,
            newAttributes: PrintAttributes,
            cancellationSignal: CancellationSignal,
            callback: LayoutResultCallback,
            extras: Bundle
        ) {
            callback.onLayoutFinished(
                PrintDocumentInfo.Builder(documentName)
                    .setContentType(PrintDocumentInfo.CONTENT_TYPE_DOCUMENT).build(), true
            )
        }

        override fun onWrite(
            pages: Array<out PageRange>,
            destination: ParcelFileDescriptor,
            cancellationSignal: CancellationSignal,
            callback: WriteResultCallback
        ) {
            try {
                var inputStream = if (pdfFilePath.startsWith("content://")) {
                    val uri = Uri.parse(pdfFilePath)
                    context.contentResolver.openInputStream(uri)
                } else FileInputStream(File(pdfFilePath))
                val outputStream = FileOutputStream(destination.fileDescriptor)
                val buffer = ByteArray(1024)
                var bytesRead: Int = inputStream!!.read(buffer)
                while (bytesRead > 0) {
                    outputStream.write(buffer, 0, bytesRead)
                    bytesRead = inputStream.read(buffer)
                }
                inputStream.close()
                outputStream.close()
                callback.onWriteFinished(arrayOf(PageRange.ALL_PAGES))
            } catch (e: IOException) {
                callback.onWriteFailed(e.localizedMessage)
            }
        }
    }

    class PDFLoadImageOptions {

        var imageSizeThreshold: Int = 0
        var imageScale: Double = 1.0
        var quality: Int = 100
    }

    companion object {

        @Throws(IOException::class)
        fun printPDF(context: Context, filePath: String, name: String) {
            val printAdapter = PDFUtils.PDFPrintDocumentAdapter(context, filePath, name)
            val printManager = context.getSystemService(Context.PRINT_SERVICE) as PrintManager
            printManager.print(name, printAdapter, null)
        }

        @Throws(IOException::class)
        // fun compressPDF(src: String?, dest: String?, compressionLevel: Int, jpgQuality: Int) {
        //     val writer = PdfWriter(
        //         dest,
        //         WriterProperties().setCompressionLevel(compressionLevel)
        //             .setFullCompressionMode(true)
        //     )
        //     val pdfDoc = PdfDocument(PdfReader(src), writer)

        //     // Iterate over all pages to get all images.
        //     for (i in 1..pdfDoc.getNumberOfPages()) {
        //         val page = pdfDoc.getPage(i)
        //         val pageDict = page.pdfObject
        //         val resources = pageDict.getAsDictionary(PdfName.Resources)
        //         // Get images
        //         val xObjects = resources.getAsDictionary(PdfName.XObject)
        //         val iter: Iterator<PdfName> = xObjects.keySet().iterator()
        //         while (iter.hasNext()) {

        //             // Get image
        //             val imgRef = iter.next()
        //             val stream = xObjects.getAsStream(imgRef)
        //             if (stream != null && PdfName.Image == stream.getAsName(PdfName.Subtype)) {
        //                 val image = PdfImageXObject(stream)
        //                 val imageBytes = image.imageBytes
        //                 val imgBytes = ByteArrayOutputStream()
        //                 (BitmapFactory.decodeByteArray(imageBytes, 0, imageBytes.size)
        //                     ?: continue).compress(Bitmap.CompressFormat.JPEG, jpgQuality, imgBytes)
        //                 stream.compressionLevel = compressionLevel
        //                 stream.setData(imgBytes.toByteArray(), false)
        //                 stream.put(PdfName.Filter, PdfName.DCTDecode)
        //                 imgBytes.close()
        //             }
        //         }
        //     }
        //     pdfDoc.close()
        // }

        /**
         * Calculate an inSampleSize for use in a [BitmapFactory.Options] object when decoding
         * bitmaps using the decode* methods from [BitmapFactory]. This implementation calculates
         * the closest inSampleSize that is a power of 2 and will result in the final decoded bitmap
         * having a width and height equal to or larger than the requested width and height.
         *
         * @param imageWidth  The original width of the resulting bitmap
         * @param imageHeight The original height of the resulting bitmap
         * @param width    The requested width of the resulting bitmap
         * @param height   The requested height of the resulting bitmap
         * @return The value to be used for inSampleSize
         */
        private fun calculateInSampleSize(
            imageWidth: Int,
            imageHeight: Int,
            width: Int,
            height: Int
        ): Int {
            // BEGIN_INCLUDE (calculate_sample_size)
            // Raw height and width of image
            var reqWidth = width
            var reqHeight = height
            reqWidth = if (reqWidth > 0) reqWidth else imageWidth
            reqHeight = if (reqHeight > 0) reqHeight else imageHeight
            var inSampleSize = 1
            if (imageHeight > reqHeight || imageWidth > reqWidth) {
                val halfHeight = imageHeight / 2
                val halfWidth = imageWidth / 2

                // Calculate the largest inSampleSize value that is a power of 2 and keeps both
                // height and width larger than the requested height and width.
                while (halfHeight / inSampleSize > reqHeight && halfWidth / inSampleSize > reqWidth) {
                    inSampleSize *= 2
                }

                // This offers some additional logic in case the image has a strange
                // aspect ratio. For example, a panorama may have a much larger
                // width than height. In these cases the total pixels might still
                // end up being too large to fit comfortably in memory, so we should
                // be more aggressive with sample down the image (=larger inSampleSize).
                var totalPixels =
                    (imageWidth / inSampleSize * (imageHeight / inSampleSize)).toLong()

                // Anything more than 2x the requested pixels we'll sample down further
                val totalReqPixelsCap = (reqWidth * reqHeight * 2).toLong()
                while (totalPixels > totalReqPixelsCap) {
                    inSampleSize *= 2
                    totalPixels =
                        (imageWidth / inSampleSize * (imageHeight / inSampleSize)).toLong()
                }
            }
            return inSampleSize
            // END_INCLUDE (calculate_sample_size)
        }

        private fun loadImage(
            src: String,
            imageWidth: Double,
            imageHeight: Double,
            width: Double,
            height: Double,
            rotation: Int,
            colorMatrix: String?,
            options: PDFLoadImageOptions
        ): Image? {
            var reqWidth = width
            var reqHeight = height
            if (options.imageSizeThreshold != 0) {
                val minSize = max(reqWidth, reqHeight)
                if (minSize > options.imageSizeThreshold) {
                    val resizeScale = 1.0 * minSize / options.imageSizeThreshold
                    reqWidth = ((reqWidth / resizeScale))
                    reqHeight = ((reqHeight / resizeScale))
                }
            }
            if (options.imageScale != 1.0) {
                reqWidth = ((reqWidth * options.imageScale))
                reqHeight = ((reqHeight * options.imageScale))
            }
            val hasColorMatrix = colorMatrix != null && colorMatrix != "null"
            val finalBitmapOptions = BitmapFactory.Options()
            finalBitmapOptions.inMutable = hasColorMatrix
            if (imageWidth != reqWidth || imageHeight != reqHeight) {
                finalBitmapOptions.inSampleSize =
                    calculateInSampleSize(
                        imageWidth.toInt(),
                        imageHeight.toInt(),
                        reqWidth.toInt(),
                        reqHeight.toInt()
                    )
            }
            finalBitmapOptions.inMutable = colorMatrix != null
            var bmp = BitmapFactory.decodeFile(src, finalBitmapOptions) ?: return null
            if (hasColorMatrix) {
                val jsonArray = JSONArray(colorMatrix)
                val floatArray = Array(jsonArray.length()) { jsonArray.getDouble(it).toFloat() }
                val filteredBmp = Bitmap.createBitmap(bmp.width, bmp.height, bmp.config ?: Bitmap.Config.ARGB_8888)
                val canvas = android.graphics.Canvas(filteredBmp)
                val paint = Paint()
                paint.colorFilter = ColorMatrixColorFilter(floatArray.toFloatArray())
                canvas.drawBitmap(bmp, 0F, 0F, paint)
                bmp.recycle()
                bmp = filteredBmp
            }

            val imgBytes = ByteArrayOutputStream()
            if (options.quality > 0) {
                bmp.compress(Bitmap.CompressFormat.JPEG, options.quality, imgBytes)
            } else {
                bmp.compress(Bitmap.CompressFormat.PNG, options.quality, imgBytes)
            }
            bmp.recycle()
            val imageData = ImageDataFactory.create(imgBytes.toByteArray())
            return Image(imageData).setRotationAngle(-rotation * PI / 180.0)
        }

        private class FontCache {
            var cyrillicFont: PdfFont? = null
            var cjkFont: PdfFont? = null

            fun getFont(text: String): PdfFont {
                return if (containsCJK(text)) {
                    if (cjkFont == null) {
                        cjkFont = PdfFontFactory.createTtcFont(
                            "/system/fonts/NotoSansCJK-Regular.ttc",
                            0,
                            PdfEncodings.IDENTITY_H,
                            EmbeddingStrategy.PREFER_NOT_EMBEDDED,
                            false
                        )
                    }
                    cjkFont!!
                } else {
                    if (cyrillicFont == null) {
                        cyrillicFont = PdfFontFactory.createFont(
                            "/system/fonts/Roboto-Regular.ttf",
                            PdfEncodings.IDENTITY_H
                        )
                    }
                    cyrillicFont!!
                }
            }

            private fun containsCJK(text: String): Boolean {
                return text.any { char ->
                    char.code in 0x4E00..0x9FFF ||
                    char.code in 0x3040..0x309F ||
                    char.code in 0x30A0..0x30FF
                }
            }
        }

        // OCR text layer geometry. A tesseract line box spans ascenders to descenders:
        // the font size is the box height and the baseline sits just above the box bottom.
        // Keep in sync with PDFCanvas.ts (ios).
        private const val OCR_FONT_SIZE_RATIO = 1f
        private const val OCR_BASELINE_RATIO = 0.8f
        private const val OCR_MIN_HORIZONTAL_SCALE = 25f
        private const val OCR_MAX_HORIZONTAL_SCALE = 400f

        /**
         * Draw the ocr text layer on top of the image drawn at [posX], [posY] with
         * size [drawnWidth] x [drawnHeight] (in pdf points).
         * Each block is drawn as a single run placed on its baseline and horizontally
         * scaled to cover exactly the detected box: no reflow, no wrapping.
         */
        private fun drawOCRData(
            pdfDoc: PdfDocument,
            page: JSONObject,
            posX: Float,
            posY: Float,
            drawnWidth: Float,
            drawnHeight: Float,
            debug: Boolean,
            fontCache: FontCache
        ) {
            val ocrData = page.optJSONObject("ocrData") ?: return
            // ocr boxes live in the ocr image space, which is already rotated (the ocr ran with page rotation)
            val ocrImageWidth = ocrData.getDouble("imageWidth").toFloat()
            val ocrImageHeight = ocrData.getDouble("imageHeight").toFloat()
            if (ocrImageWidth <= 0 || ocrImageHeight <= 0) {
                return
            }
            val scaleX = drawnWidth / ocrImageWidth
            val scaleY = drawnHeight / ocrImageHeight
            val blocks = ocrData.getJSONArray("blocks")
            val canvas = PdfCanvas(pdfDoc.lastPage)
            for (i in 0..<blocks.length()) {
                val block = blocks.getJSONObject(i)
                val text = block.getString("text")
                if (text.isEmpty()) {
                    continue
                }
                // a block holds several lines when the ocr ran at paragraph level (documents
                // scanned before line level ocr): share the box height between them
                val lines = text.split('\n').map { it.trim() }.filter { it.isNotEmpty() }
                if (lines.isEmpty()) {
                    continue
                }
                val box = block.getJSONObject("box")
                val boxWidth = box.getDouble("width").toFloat() * scaleX
                val boxHeight = box.getDouble("height").toFloat() * scaleY
                val left = posX + box.getDouble("x").toFloat() * scaleX
                // pdf is y up: the box top is measured from the bottom of the drawn image
                val boxTop = posY + drawnHeight - box.getDouble("y").toFloat() * scaleY
                val lineHeight = boxHeight / lines.size
                val fontSize = lineHeight * OCR_FONT_SIZE_RATIO
                if (fontSize <= 0) {
                    continue
                }
                val font = fontCache.getFont(text)
                lines.forEachIndexed { lineIndex, line ->
                    val lineTop = boxTop - lineIndex * lineHeight
                    val textWidth = font.getWidth(line, fontSize)
                    // stretch the run so that it covers exactly the detected box
                    val horizontalScale = if (textWidth > 0) {
                        (100f * boxWidth / textWidth).coerceIn(OCR_MIN_HORIZONTAL_SCALE, OCR_MAX_HORIZONTAL_SCALE)
                    } else {
                        100f
                    }

                    if (debug) {
                        canvas.saveState()
                            .rectangle(Rectangle(left, lineTop - lineHeight, boxWidth, lineHeight))
                            .setFillColor(ColorConstants.WHITE)
                            .fill().restoreState()
                    }

                    canvas.saveState()
                        .beginText()
                        .setTextRenderingMode(if (debug) PdfCanvasConstants.TextRenderingMode.FILL else PdfCanvasConstants.TextRenderingMode.INVISIBLE)
                        .setFillColor(if (debug) ColorConstants.RED else ColorConstants.BLACK)
                        .setFontAndSize(font, fontSize)
                        .setHorizontalScaling(horizontalScale)
                        .setTextMatrix(left, lineTop - lineHeight * OCR_BASELINE_RATIO)
                        .showText(line)
                        .endText()
                        .restoreState()
                }
            }
        }

        fun generatePDF(
            context: Context,
            destFolder: String,
            fileName: String,
            options: String
        ): String? {
            val destinationFilePath = "$destFolder/$fileName"
            var generateFilePath = destinationFilePath
            var needsCopy = false
            if (destFolder.startsWith("content://")) {
                needsCopy = true
                generateFilePath = context.cacheDir.toString() + "/${fileName}_compressed.pdf"
            }
            val fontCache = FontCache()

            val jsonOps = JSONObject(options)
            val compressionLevel = jsonOps.optInt("compressionLevel", 9)
            val paperSize = jsonOps.optString("paper_size", "full")
//            var paperSize = "full"
            val orientation = jsonOps.optString("orientation", "portrait")
            val color = jsonOps.optString("color", "color")
            val blackAndWhite = color == "black_white"
            val drawOcrText = jsonOps.optBoolean("draw_ocr_text", true)
            val overwrite = jsonOps.optBoolean("overwrite", false)
            val debug = jsonOps.optBoolean("debug", false)
            val pagePadding = jsonOps.optInt("page_padding", 0).toFloat()
            val imageScale = jsonOps.optDouble("image_page_scale", 2.0).toFloat()
//            var pagePadding = 100F
            var itemsPerPage = jsonOps.optInt("items_per_page", 1)
            val loadImageOptions = PDFLoadImageOptions()
            loadImageOptions.imageScale = jsonOps.optDouble("imageLoadScale", 1.0)
            loadImageOptions.imageSizeThreshold = jsonOps.optInt("imageSizeThreshold", 0)
            loadImageOptions.quality = jsonOps.optInt("jpegQuality", 80)
            val pages = jsonOps.getJSONArray("pages")
            val pagesCount = pages.length()
            val isLandscape = orientation == "landscape"

//            when (paperSize) {
//                "full" -> {
//                    pageSize = PageSize(page.optInt("width", 0).toFloat(), page.optInt("height", 0).toFloat())
//                    itemsPerPage = 1
//                }
//                "a5" -> if (isLandscape) PageSize.A5.rotate() else PageSize.A5
//                "a3" -> if (isLandscape) PageSize.A3.rotate() else PageSize.A3
//                "a4" -> if (isLandscape) PageSize.A4.rotate() else PageSize.A4
//            }
            val props = WriterProperties().setCompressionLevel(compressionLevel)
                .setFullCompressionMode(true).setPdfVersion(
                PdfVersion.PDF_1_4
            )
            val password = jsonOps.optString("password", null)
            if (password != null && password != "null") {
                props.setStandardEncryption(password.toByteArray(), password.toByteArray(), 0, EncryptionConstants.ENCRYPTION_AES_256);
            } 
            val writer = PdfWriter(generateFilePath, props)
            val pdfDoc = PdfDocument(writer)
            var document: Document? = null

//            val internalStorageDir = context.getFilesDir().getAbsolutePath()

            // Create FontProvider with comprehensive font support
            // val fontProvider = FontProvider()

            // Add system fonts first (includes fallbacks)
            // fontProvider.addSystemFonts()
            // Log.d("JS", "addSystemFonts " + fontProvider.getFontSet().getFonts().size)
            
            // Add comprehensive Unicode fonts
            // addUnicodeFontsToProvider(fontProvider)
            // Log.d("JS", "fontProvider fonts " + fontProvider.getFontSet().getFonts().map { it.getFontName() }?.toTypedArray().contentToString())

            //sel.getFontSet().addDirectory("src/main/res/font")
            if (paperSize == "full") {
                itemsPerPage = 1
                for (i in 0..<pagesCount) {
                    val page = pages.getJSONObject(i)
                    val imageSrc = page.optString("imagePath")
                    if (imageSrc.isNullOrEmpty() || imageSrc == "null") {
                        continue
                    }
                    val imageRotation = page.optInt("rotation", 0)
                    val imageWidth = page.getDouble("width")
                    val imageHeight = page.getDouble("height")
                    val colorMatrix = page.optString("colorMatrix")
                    val image = loadImage(
                        imageSrc,
                        imageWidth,
                        imageHeight,
                        imageWidth,
                        imageHeight,
                        imageRotation,
                        colorMatrix,
                        loadImageOptions
                    ) ?: continue

                    val pageSize = if (imageRotation % 180 != 0) PageSize(
                        image.imageHeight,
                        image.imageWidth
                    ) else PageSize(image.imageWidth, image.imageHeight)
                    if (document == null) {
                        document = Document(pdfDoc, pageSize)
                        // document.fontProvider = fontProvider
                        // document.setProperty(Property.FONT, arrayOf("Roboto", "DroidSans"))
                        document.setMargins(0F, 0F, 0F, 0F)
                    } else {
                        pdfDoc.addNewPage(pageSize)
                        document.add(AreaBreak())
                    }
                    document.add(image)
                    if (drawOcrText) {
                        // the image fills the whole page (page sized from it, no margins)
                        drawOCRData(
                            pdfDoc, page,
                            0F, 0F,
                            pageSize.width, pageSize.height,
                            debug,
                            fontCache
                        )
                    }
                }
            } else {
                val list = mutableListOf<JSONObject>()
                for (i in 0 until pagesCount) {
                    list.add(pages.getJSONObject(i))
                }
                val pageSize = when (paperSize) {
                    "letter" -> if (isLandscape) PageSize.LETTER.rotate() else PageSize.LETTER
                    "a5" -> if (isLandscape) PageSize.A5.rotate() else PageSize.A5
                    "a3" -> if (isLandscape) PageSize.A3.rotate() else PageSize.A3
                    else -> if (isLandscape) PageSize.A4.rotate() else PageSize.A4
                }
                var totalIndex = 0
                val items = list.chunked(itemsPerPage)
                items.forEachIndexed { idx, pageItems ->
                    val nbItems = pageItems.size
                    var columns = if (itemsPerPage > 2) 2 else 1
                    var rows =
                        if (itemsPerPage > 2) ceil(itemsPerPage / 2F).toInt() else itemsPerPage
                    if (orientation == "landscape") {
                        val temp = columns
                        columns = rows
                        rows = temp
                    }
                    val availableWidth = pageSize.width
                    val availableHeight = pageSize.height
                    val shared = min(rows, columns)
                    val widthPerColumn = availableWidth / columns
                    val heightPerRow = availableHeight / rows
                    var ddx = pagePadding
                    var ddy = pagePadding
                    var toDrawWidth: Double
                    var toDrawHeight: Double
                    if (idx == 0) {
                        document = Document(pdfDoc, pageSize)
                        // document.fontProvider = fontProvider
                        // document.setProperty(Property.FONT, arrayOf("Roboto", "DroidSans"))
                        document.setMargins(pagePadding, pagePadding, pagePadding, pagePadding)
                        pdfDoc.addNewPage(pageSize)
                    } else if (idx < items.size) {
                        pdfDoc.addNewPage(pageSize)
                        document!!.add(AreaBreak())
                    }
                    for (i in rows - 1 downTo 0) {
//                        for (i in 0..<rows) {
                        for (j in 0..<columns) {
                            val pageIndex = i * shared + j
                            if (pageIndex >= nbItems) {

                                continue
                            }
                            val last = pageIndex == itemsPerPage - 1
                            val page = pageItems[pageIndex]
                            val imageRotation = (page.optInt("rotation", 0) + 360) % 360

                            val imageSrc = page.optString("imagePath")
                            if (imageSrc.isNullOrEmpty() || imageSrc ==  "null") {
                                continue
                            }
                            val imageWidth = page.getDouble("width")
                            val imageHeight = page.getDouble("height")
                            val colorMatrix = page.optString("colorMatrix")

//                            if (imageRotation % 180 !== 0) {
//                                val temp = imageWidth
//                                imageWidth = imageHeight
//                                imageHeight = temp
//                            }
                            val pageRatio =
                                if (imageRotation % 180 != 0) imageHeight / imageWidth else imageWidth / imageHeight
                            var itemAvailableWidth = widthPerColumn - 2 * pagePadding
                            val itemAvailableHeight = heightPerRow - 2 * pagePadding
                            if (last && columns * rows > nbItems) {
                                itemAvailableWidth = 2 * widthPerColumn - 2 * pagePadding
                            }
                            val itemRatio = itemAvailableWidth / itemAvailableHeight
                            if (pageRatio > itemRatio) {
                                toDrawWidth = itemAvailableWidth.toDouble()
                                toDrawHeight = itemAvailableWidth / pageRatio
                            } else {
                                toDrawHeight = itemAvailableHeight.toDouble()
                                toDrawWidth = itemAvailableHeight * pageRatio
                            }
                            var reqWidth = toDrawWidth * imageScale
                            var reqHeight = toDrawHeight * imageScale
                            if (imageRotation % 180 != 0) {
                                val temp = reqWidth
                                reqWidth = reqHeight
                                reqHeight = temp
                            }
                            val image =
                                loadImage(
                                    imageSrc,
                                    imageWidth,
                                    imageHeight,
                                    reqWidth,
                                    reqHeight,
                                    imageRotation,
                                    colorMatrix,
                                    loadImageOptions
                                )?.scaleAbsolute(
                                    (reqWidth / imageScale).toFloat(),
                                    (reqHeight / imageScale).toFloat()
                                )
                                    ?: continue


                            val posX = ddx + itemAvailableWidth / 2 - toDrawWidth.toFloat() / 2
                            // where the image actually lands on the page, before the rotation anchor fixups
                            val imagePosY = ddy + itemAvailableHeight / 2 - toDrawHeight.toFloat() / 2
                            var posY = imagePosY

                            if ((imageRotation % 360) == 180) {
                                posY += toDrawHeight.toFloat()
                            } else if ((imageRotation % 360) == 90) {
                                posY += toDrawHeight.toFloat()
                            }
                            image.setFixedPosition(posX, posY)
                            document!!.add(image)
                            if (drawOcrText) {
                                drawOCRData(
                                    pdfDoc, page,
                                    posX, imagePosY,
                                    toDrawWidth.toFloat(), toDrawHeight.toFloat(),
                                    debug,
                                    fontCache
                                )
                            }

                            // for those same size!
                            ddx += widthPerColumn
                            totalIndex++
                        }
                        ddy += heightPerRow
                        ddx = pagePadding
                    }
                    // if (totalIndex < items.size - 1) {
                    // }
                }
            }
            if (document == null) {
                throw Exception("no document created while exporting PDF $fileName in $destFolder")
            }
            document!!.close()
            if (needsCopy) {
                val outDocument =
                    androidx.documentfile.provider.DocumentFile.fromTreeUri(
                        context,
                        android.net.Uri.parse(destFolder)
                    )
                        ?: throw Exception("could not create access folder $destFolder")


                var outfile: androidx.documentfile.provider.DocumentFile
                if (overwrite) {
                    outfile = outDocument.findFile(fileName) ?: outDocument.createFile(
                        "application/pdf",
                        fileName
                    ) ?: throw Exception("could not create file $fileName in $destFolder")
                } else {
                    outfile =
                        outDocument.createFile("application/pdf", fileName) ?: outDocument.findFile(
                            fileName
                        ) ?: throw Exception("could not create file $fileName in $destFolder")
                }
                val os = context.contentResolver.openOutputStream(outfile.uri)
                    ?: throw Exception("could not open file ${outfile.uri} for writing")
                FileInputStream(java.io.File(generateFilePath)).use { input ->
                    os.use { output ->
                        input.copyTo(output)
                    }
                }
                return outfile.uri.toString()
            }
            return destinationFilePath
        }

        fun generatePDFASync(
            context: Context,
            destFolder: String,
            fileName: String,
            options: String,
            callback: FunctionCallback
        ) {
            thread(start = true) {
                try {
                    val result = generatePDF(context, destFolder, fileName, options)
                    callback.onResult(null, result)
                } catch (e: Exception) {
                    callback.onResult(e, null)
                }
            }
        }

        fun importPdfToTempImages(
            context: Context,
            src: String,
            callback: FunctionCallback,
            options: String?
        ) {
            thread(start = true) {
                var parcelFileDescriptor: ParcelFileDescriptor? = null
                var inputStream: InputStream? = null
                var renderer: PdfRenderer? = null
                val result = JSONArray()
                try {
                    val uri = Uri.parse(src)
                    var pdfFileName = ImageUtil.getFileNameSync(context, uri)
                    var compressFormat = "jpg"
                    var compressQuality = 100
                    var scale = 2.0
                    var importPDFImages = false
                    if (options != null) {
                        try {
                            val jsOptions = JSONObject(options)
                            compressFormat = jsOptions.optString("compressFormat", compressFormat)
                            compressQuality = jsOptions.optInt("compressQuality", compressQuality)
                            importPDFImages =
                                jsOptions.optBoolean("importPDFImages", importPDFImages)
                            scale = jsOptions.optDouble("scale", scale)
                        } catch (ignored: JSONException) {
                        }
                    }
                    if (importPDFImages) {
                        inputStream = context.contentResolver.openInputStream(uri)
                        val pdfDoc = PdfDocument(PdfReader(inputStream))
                        for (i in 1..pdfDoc.getNumberOfPages()) {
                            PdfCanvasProcessor(object : IEventListener {
                                override fun eventOccurred(data: IEventData?, type: EventType?) {
                                    if (data is ImageRenderInfo) {
                                        try {
                                            val bitmap = BitmapFactory.decodeByteArray(
                                                data.image.imageBytes,
                                                0,
                                                data.image.imageBytes.size
                                            )
                                            val temp = File.createTempFile(
                                                "${pdfFileName}_$i",
                                                ".$compressFormat", context.cacheDir
                                            )
                                            FileOutputStream(temp).use { out ->
                                                bitmap.compress(
                                                    ImageUtil.getTargetFormat(compressFormat),
                                                    compressQuality,
                                                    out
                                                )
                                            }
                                            result.put(temp.path)
                                        } catch (e: IOException) {
                                            System.err.println("Error while extracting image: " + e.message)
                                        }
                                    }
                                }

                                override fun getSupportedEvents(): MutableSet<EventType> {
                                    return mutableSetOf(EventType.RENDER_IMAGE); }
                            }).processPageContent(pdfDoc.getPage(i));
                        }
                    } else {
                        parcelFileDescriptor = context.contentResolver.openFileDescriptor(uri, "r")
                        if (parcelFileDescriptor != null) {
                            renderer = PdfRenderer(parcelFileDescriptor)

                            // Loop over all pages to find barcodes
                            var renderedPage: Bitmap
                            for (i in 0 until renderer.pageCount) {
                                val page = renderer.openPage(i)
                                renderedPage = Bitmap.createBitmap(
                                    (page.width * scale).toInt(),
                                    (page.height * scale).toInt(),
                                    Bitmap.Config.ARGB_8888
                                )
                                val canvas = android.graphics.Canvas(renderedPage);
                                canvas.drawColor(android.graphics.Color.WHITE);
                                page.render(
                                    renderedPage,
                                    null,
                                    null,
                                    PdfRenderer.Page.RENDER_MODE_FOR_PRINT
                                )
                                page.close()
                                val temp = File.createTempFile(
                                    "${pdfFileName}_$i",
                                    ".$compressFormat", context.cacheDir
                                )
                                FileOutputStream(temp).use { out ->
                                    renderedPage.compress(
                                        ImageUtil.getTargetFormat(compressFormat),
                                        compressQuality,
                                        out
                                    )
                                }
                                result.put(temp.path)
                                renderedPage?.recycle()
                            }
                        } else {
                            throw ImageUtil.ImageNotFoundException(src)
                        }
                    }

                    callback.onResult(null, result.toString())
                } catch (e: IOException) {
                    callback.onResult(e, null)
                } finally {
                    inputStream?.close()
                    // Resource handling
                    renderer?.close()
                    if (parcelFileDescriptor != null) {
                        try {
                            parcelFileDescriptor.close()
                        } catch (e: IOException) {
                            e.printStackTrace()
                        }
                    }
                }
            }
        }
    }
}