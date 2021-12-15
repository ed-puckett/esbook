'use strict';

(async ({ current_script, facet_export, facet_load_error }) => { try {  // facet begin

    // getSVGString() and svgString2Image():
    // From: http://bl.ocks.org/Rokotyan/0556f8facbaf344507cdc45dc3622177
    // Nikita Rokotyan’s Block 0556f8facbaf344507cdc45dc3622177
    // "Export SVG D3 visualization to PNG or JPEG"
    // Released under the The MIT License.

    // updated to accept externally-parsed cssStyleText
    function getSVGString( svgNode, cssStyleText ) {
        svgNode.setAttribute('xlink', 'http://www.w3.org/1999/xlink');
        cssStyleText = cssStyleText ?? getCSSStyles( svgNode );  // getCSSStyles is not reliable
        appendCSS( cssStyleText, svgNode );

        var serializer = new XMLSerializer();
        var svgString = serializer.serializeToString(svgNode);
        svgString = svgString.replace(/(\w+)?:?xlink=/g, 'xmlns:xlink='); // Fix root xlink without namespace
        svgString = svgString.replace(/NS\d+:href/g, 'xlink:href'); // Safari NS namespace fix

        return svgString;

        function getCSSStyles( parentElement ) {
            var selectorTextArr = [];

            // Add Parent element Id and Classes to the list
            selectorTextArr.push( '#'+parentElement.id );
            for (var c = 0; c < parentElement.classList.length; c++)
                if ( !contains('.'+parentElement.classList[c], selectorTextArr) )
                    selectorTextArr.push( '.'+parentElement.classList[c] );

            // Add Children element Ids and Classes to the list
            var nodes = parentElement.getElementsByTagName("*");
            for (var i = 0; i < nodes.length; i++) {
                var id = nodes[i].id;
                if ( !contains('#'+id, selectorTextArr) )
                    selectorTextArr.push( '#'+id );

                var classes = nodes[i].classList;
                for (var c = 0; c < classes.length; c++)
                    if ( !contains('.'+classes[c], selectorTextArr) )
                        selectorTextArr.push( '.'+classes[c] );
            }

            // Extract CSS Rules
            var extractedCSSText = "";
            for (var i = 0; i < document.styleSheets.length; i++) {
                var s = document.styleSheets[i];

                try {
                    if(!s.cssRules) continue;
                } catch( e ) {
                    if(e.name !== 'SecurityError') throw e; // for Firefox
                    continue;
                }

                var cssRules = s.cssRules;
                for (var r = 0; r < cssRules.length; r++) {
                    if ( contains( cssRules[r].selectorText, selectorTextArr ) )
                        extractedCSSText += cssRules[r].cssText;
                }
            }

            return extractedCSSText;

            function contains(str,arr) {
                return arr.indexOf( str ) === -1 ? false : true;
            }
        }

        function appendCSS( cssText, element ) {
            var styleElement = document.createElement("style");
            styleElement.setAttribute("type","text/css");
            styleElement.innerHTML = cssText;
            var refNode = element.hasChildNodes() ? element.children[0] : null;
            element.insertBefore( styleElement, refNode );
        }
    }

    function svgString2Image( svgString, width, height, format, callback ) {
        var format = format ? format : 'png';

        var imgsrc = 'data:image/svg+xml;base64,'+ btoa( unescape( encodeURIComponent( svgString ) ) ); // Convert SVG string to data URL

        var canvas = document.createElement("canvas");
        var context = canvas.getContext("2d");

        canvas.width = width;
        canvas.height = height;

        var image = new Image();
        image.onload = function() {
            context.clearRect ( 0, 0, width, height );
            context.drawImage(image, 0, 0, width, height);

            canvas.toBlob( function(blob) {
                var filesize = Math.round( blob.length/1024 ) + ' KB';
                if ( callback ) callback( blob, filesize );
            });
        };

        image.src = imgsrc;
    }

    // This is a simplistic replacement for the unreliable function
    // getCSSStyles (within function getSVGString above).
    function get_all_css_with_selector_prefix(selector_prefix) {
        const css_text = [];

        for (const s of document.styleSheets) {
            try {
                if(!s.cssRules) continue;
            } catch (e) {
                if(e.name !== 'SecurityError') throw e;  // for Firefox
                continue;
            }

            for (const rule of s.cssRules) {
                if (rule.selectorText && rule.cssText) {
                    if (rule.selectorText.startsWith(selector_prefix)) {
                        css_text.push(rule.cssText);
                    }
                }
            }
        }

        return css_text.join('\n');
    }


    facet_export({
        getSVGString,
        svgString2Image,
        get_all_css_with_selector_prefix,
    });

} catch (err) { facet_load_error(err, current_script); } })(facet_init());  // facet end
