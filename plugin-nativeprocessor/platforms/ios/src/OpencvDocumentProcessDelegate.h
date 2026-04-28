#import <Foundation/Foundation.h>
#import <CoreMedia/CoreMedia.h>
#import <CoreVideo/CoreVideo.h>
#import <Webkit/Webkit.h>
#import "NativeScriptEmbedder.h"
#import "nsdocumentscanner-Swift.h"

@interface OpencvDocumentProcessDelegate : NSObject <ProcessRawVideoSampleBufferDelegate>
@property (nullable, retain, nonatomic) NSCropView *cropView;
@property (nullable, retain, nonatomic) id<OnQRCode> onQRCode;
@property (nullable, retain, nonatomic) AutoScanHandler *innerAutoScanHandler;
@property (nullable, retain, nonatomic) NSObject *autoScanHandler;
@property (nonatomic, assign) NSInteger  previewResizeThreshold;
@property (nonatomic, assign) BOOL  detectDocuments;
@property (nonatomic, assign) BOOL  detectQRCode;
@property (nonatomic, copy) NSString* _Nullable  detectQRCodeOptions;

- (instancetype _Nonnull )initWithCropView:(NSCropView*_Nonnull) view;
- (instancetype _Nonnull )initWithCropView:(NSCropView*_Nonnull) view onQRCode:(id<OnQRCode>_Nonnull)onQRCode;
- (void) setAutoScanHandler:(NSObject *_Nullable)value;


+(NSArray*_Nullable)findDocumentCorners:(UIImage*_Nonnull)image  shrunkImageHeight:(CGFloat)shrunkImageHeight imageRotation:(NSInteger)imageRotation scale:(CGFloat)scale options:(NSString*_Nullable)options;

+(void) getJSONDocumentCornersSync:(UIImage*_Nonnull)image  shrunkImageHeight:(CGFloat)shrunkImageHeight imageRotation:(NSInteger)imageRotation delegate:(id<CompletionDelegate>_Nonnull)delegate scale:(CGFloat)scale options:(NSString*_Nullable)options;
+(void) getJSONDocumentCorners:(UIImage*_Nonnull)image  shrunkImageHeight:(CGFloat)shrunkImageHeight imageRotation:(NSInteger)imageRotation delegate:(id<CompletionDelegate>_Nonnull)delegate;
+(void) getJSONDocumentCornersFromFile:(NSString*_Nonnull)src  shrunkImageHeight:(CGFloat)shrunkImageHeight imageRotation:(NSInteger)imageRotation delegate:(id<CompletionDelegate>_Nonnull)delegate options:(NSString*_Nullable)options;
+(void) getJSONDocumentCornersFromFile:(NSString*_Nonnull)src  shrunkImageHeight:(CGFloat)shrunkImageHeight imageRotation:(NSInteger)imageRotation delegate:(id<CompletionDelegate>_Nonnull)delegate;
+(void) getJSONDocumentCornersFromFile:(NSString*_Nonnull)src delegate:(id<CompletionDelegate>_Nonnull)delegate options:(NSString*_Nullable)options;


// PRAGMA: cropDocument
+(void) cropDocumentSync:(UIImage*_Nonnull)image quads:(NSString*_Nonnull)quads delegate:(id<CompletionDelegate>_Nonnull)delegate  transforms:(NSString*_Nullable)transforms saveInFolder:(NSString*_Nullable)saveInFolder fileName:(NSString*_Nullable)fileName compressFormat:(NSString*_Nonnull)compressFormat compressQuality:(CGFloat)compressQuality;
+(void) cropDocumentSync:(UIImage*_Nonnull)image quads:(NSString*_Nonnull)quads delegate:(id<CompletionDelegate>_Nonnull)delegate  transforms:(NSString*_Nullable)transforms saveInFolder:(NSString*_Nullable)saveInFolder fileName:(NSString*_Nullable)fileName compressFormat:(NSString*_Nonnull)compressFormat;
+(void) cropDocumentSync:(UIImage*_Nonnull)image quads:(NSString*_Nonnull)quads delegate:(id<CompletionDelegate>_Nonnull)delegate  transforms:(NSString*_Nullable)transforms saveInFolder:(NSString*_Nullable)saveInFolder fileName:(NSString*_Nullable)fileName;
+(void) cropDocumentSync:(UIImage*_Nonnull)image quads:(NSString*_Nonnull)quads delegate:(id<CompletionDelegate>_Nonnull)delegate  transforms:(NSString*_Nullable)transforms;

// PRAGMA: cropDocumentFromFile
+(void) cropDocumentFromFile:(NSString*_Nonnull) src quads:(NSString*_Nonnull)quads delegate:(id<CompletionDelegate>_Nonnull)delegate options:(NSString*_Nullable)optionsStr;
+(void) cropDocumentFromFile:(NSString*_Nonnull) src quads:(NSString*_Nonnull)quads  delegate:(id<CompletionDelegate>_Nonnull)delegate;


// PRAGMA: cropDocument
+(void) cropDocument:(UIImage*_Nonnull) image quads:(NSString*_Nonnull)quads  delegate:(id<CompletionDelegate>_Nonnull)delegate transforms:(NSString*_Nullable)transforms;
+(void) cropDocument:(UIImage*_Nonnull) image quads:(NSString*_Nonnull)quads  delegate:(id<CompletionDelegate>_Nonnull)delegate;

// PRAGMA: ocrDocument
+(void)ocrDocumentSync:(UIImage*_Nullable)image options:(NSString*_Nonnull)options delegate:(id<CompletionDelegate>_Nonnull)delegate;
+(void)ocrDocument:(UIImage*_Nullable)image options:(NSString*_Nullable)options delegate:(id<CompletionDelegate>_Nonnull)delegate;
+(void)ocrDocumentFromFile:(NSString*_Nullable)src options:(NSString*_Nullable)options delegate:(id<CompletionDelegate>_Nonnull)delegate;


#ifdef WITH_QRCODE

// PRAGMA: detectQRCode
+(void)detectQRCodeFromFile:(NSString*_Nonnull)src options:(NSString*_Nullable)options delegate:(id<CompletionDelegate>_Nonnull)delegate;

// PRAGMA: generateQRCode
+(void)generateQRCode:(NSString*_Nonnull)text format:(NSString*_Nonnull)fromat  width:(NSInteger)width height:(NSInteger)height  options:(NSString*_Nullable)options delegate:(id<CompletionDelegate>_Nonnull)delegate;

// PRAGMA: generateQRCodeSVG
+(NSString*_Nullable)generateQRCodeSVGSync:(NSString*_Nonnull)text format:(NSString*_Nonnull)fromat  sizeHint:(NSInteger)sizeHint  options:(NSString*_Nullable)options;
+(void)generateQRCodeSVG:(NSString*_Nonnull)text format:(NSString*_Nonnull)fromat  sizeHint:(NSInteger)sizeHint  options:(NSString*_Nullable)options delegate:(id<CompletionDelegate>_Nonnull)delegate;
+(UIImage*_Nullable)generateQRCodeSync:(NSString*_Nonnull)text format:(NSString*_Nonnull)fromat  sizeHint:(NSInteger)sizeHint  options:(NSString*_Nullable)options;
+(void)generateQRCode:(NSString*_Nonnull)text format:(NSString*_Nonnull)fromat  sizeHint:(NSInteger)sizeHint  options:(NSString*_Nullable)options delegate:(id<CompletionDelegate>_Nonnull)delegate;
#endif

// PRAGMA: process
+(void)processSync:(UIImage*_Nonnull)image processes:(NSString*_Nonnull)processes options:(NSString*_Nullable)options delegate:(id<CompletionDelegate>_Nonnull)delegate scale:(CGFloat)scale;
+(void)process:(UIImage*_Nonnull)image processes:(NSString*_Nonnull)processes options:(NSString*_Nullable)options delegate:(id<CompletionDelegate>_Nonnull)delegate;
+(void)processFromFile:(NSString*_Nonnull)src processes:(NSString*_Nonnull)processes options:(NSString*_Nullable)options delegate:(id<CompletionDelegate>_Nonnull)delegate;
@end
