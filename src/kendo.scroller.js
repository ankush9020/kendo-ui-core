(function($, undefined) {
    var kendo = window.kendo,
        ui = kendo.ui,
        support = kendo.support,
        proxy = $.proxy,
        Widget = ui.Widget,
        touch = support.touch || support.pointers,
        touchLocation = kendo.touchLocation,
        min = Math.min,
        max = Math.max,
        abs = Math.abs,
        round = Math.round,
        to3DProperty,
        TRANSLATION_REGEXP = /(translate[3d]*\(|matrix\(([\s\w\d]*,){4,4})\s*(-?[\d\.]+)?[\w\s]*,?\s*(-?[\d\.]+)[\w\s]*.*?\)/i,
        SINGLE_TRANSLATION_REGEXP = /(translate([XY])\(\s*(-?[\d\.]+)?[\w\s]*\))/i,
        DEFAULT_MATRIX = [0, 0, 0, 0, 0],
        PX = "px",
        OPACITY = "opacity",
        VISIBLE = "visible",
        TRANSFORM = support.transitions.css + "transform",
        TRANSFORMSTYLE = support.transitions.prefix + "Transform",
        STARTEVENT = touch ? "touchstart" : "mousedown",
        MOVEEVENT = touch ? "touchmove" : "mousemove",
        ENDEVENT = touch ? "touchend" : "mouseup",
        FRAMERATE = 1000 / 30,
        ACCELERATION = 20,
        VELOCITY = 0.5,
        BOUNCE_LIMIT = 0,
        BOUNCE_STOP = 100,
        BOUNCE_DECELERATION = 0.1,
        SCROLLBAR_OPACITY = 0.7,
        INITIAL_FRICTION = 0.96;

        if (support.hasHW3D) {
            to3DProperty = function(value) {
                return "translate3d(" + value + ", 0)";
            };
        } else {
            to3DProperty = function(value) {
                return "translate(" + value + ")";
            };
        }

    function limitValue(value, minLimit, maxLimit) {
        return max(minLimit, min(maxLimit, value));
    }

    function numericCssValue(element, property) {
        return parseInt(element.css(property), 10) || 0;
    }

    function getScrollOffsets(scrollElement) {
        scrollElement = $(scrollElement);

        var transformStyle = scrollElement[0].style[TRANSFORMSTYLE],
            transforms = (transformStyle ? transformStyle.match(TRANSLATION_REGEXP) || transformStyle.match(SINGLE_TRANSLATION_REGEXP) || DEFAULT_MATRIX : DEFAULT_MATRIX);

        if (transforms) {
            if (transforms[2] === "Y") {
                transforms[4] = transforms[3];
                transforms[3] = 0;
            } else {
                if (transforms[2] === "X") {
                    transforms[4] = 0;
                }
            }
        }

        if (support.transitions) {
            return {x: +transforms[3], y: +transforms[4]};
        } else {
            return {x: numericCssValue(scrollElement, "marginLeft"), y: numericCssValue(scrollElement, "marginTop")};
        }
    }

    function Axis(scrollElement, property, updateCallback) {
        var boxSizeName = "inner" + property,
            cssProperty = property.toLowerCase(),
            horizontal = property === "Width",
            scrollSizeName = "scroll" + property,
            element = scrollElement.parent(),
            scrollbar = $('<div class="touch-scrollbar ' + (horizontal ? "horizontal" : "vertical") + '-scrollbar" />'),
            name = horizontal ? "x" : "y",
            dip10,
            enabled,
            minLimit,
            maxLimit,
            minStop,
            maxStop,
            ratio,
            decelerationVelocity,
            bounceLocation,
            direction,
            zoomLevel,
            directionChange,
            scrollOffset,
            boxSize,
            friction,
            lastLocation,
            startLocation,
            idx,
            timeoutId,
            winding,
            dragCanceled,
            lastCall,
            dragged;

        element.append(scrollbar);

        function updateLastLocation(location) {
            lastLocation = location;
            directionChange =+ new Date();
        }

        function changeDirection(location) {
            var delta = lastLocation - location,
                newDirection = delta/abs(delta);

            if (newDirection !== direction) {
                direction = newDirection;
                updateLastLocation(location);
            }
        }

        function updateScrollOffset(location) {
            var offset = limitValue(startLocation - location, minStop, maxStop),
                offsetValue,
                delta = 0,
                size,
                limit = 0;

            scrollOffset = -offset / zoomLevel;

            if (offset > maxLimit) {
                limit = offset - maxLimit;
            } else if (offset < minLimit) {
                limit = offset;
            }

            delta = limitValue(limit, -BOUNCE_STOP, BOUNCE_STOP);

            size = max(ratio - abs(delta), 20);

            offsetValue = limitValue(offset * ratio / boxSize + delta, 0, boxSize - size);

            scrollbar
                .css(TRANSFORM, to3DProperty(horizontal ? offsetValue + "px,0" : "0," + offsetValue + PX))
                .css(cssProperty, size + PX);

            updateCallback(name, scrollOffset);
        }

        function wait(e) {
            if (!enabled) {
                return;
            }

            dragged = false;
            clearTimeout(timeoutId);

            var location = touchLocation(e),
                coordinate = location[name];

            scrollOffset  = getScrollOffsets(scrollElement)[name];

            idx = location.idx;

            startLocation = coordinate - scrollOffset;
            updateLastLocation(coordinate);

            $(document)
                .unbind(MOVEEVENT, start)
                .bind(MOVEEVENT, start);

            scrollElement
                .unbind(ENDEVENT, stop) // Make sure previous event is removed
                .bind(ENDEVENT, stop);
        }

        function start(e) {
            var location = getTouchLocation(e);

            if (!location || abs(lastLocation - location) <= dip10) {
                return;
            }

            init();
            changeDirection(location);

            scrollbar.show()
                .css({opacity: SCROLLBAR_OPACITY, visibility: VISIBLE})
                .css(cssProperty, ratio);

            dragged = true;

            $(document).unbind(MOVEEVENT, start)
                .unbind(MOVEEVENT, drag)
                .bind(MOVEEVENT, drag);

        }

        function getTouchLocation(event) {
            event.preventDefault();
            event.stopPropagation();

            var location = touchLocation(event);
            if (location.idx === idx && !dragCanceled) {
                return location[name];
            }
        }

        function drag(e) {
            var location = getTouchLocation(e);

            if (location) {
                changeDirection(location);
                updateScrollOffset(location);
            }
        }

        function stop(e) {
            if (dragCanceled) {
                return;
            }

            var location = getTouchLocation(e);

            $(document)
                .unbind(MOVEEVENT, start)
                .unbind(MOVEEVENT, drag);

            element.unbind(ENDEVENT, stop);

            if (dragged) {
                dragged = false;
                bounceLocation = location;
                friction = INITIAL_FRICTION;
                decelerationVelocity = - (lastLocation - location) / ((+new Date() - directionChange) / ACCELERATION);
                winding = true;
                queueNextStep();
            } else {
                endKineticAnimation(true);
            }
       }

       function queueNextStep() {
           lastCall = +new Date();
           timeoutId = setTimeout(stepKineticAnimation, FRAMERATE);
       }

       function stepKineticAnimation() {
           var animationIterator = round((+new Date() - lastCall) / FRAMERATE - 1), constraint, velocity;

           if (!winding) {
               return;
           }

           while (animationIterator-- >= 0) {
               constraint = 0;
               velocity = decelerationVelocity * friction;
               bounceLocation += decelerationVelocity;

               if (-scrollOffset < minLimit) {
                   constraint = minLimit + scrollOffset;
               } else if (-scrollOffset > maxLimit) {
                   constraint = maxLimit + scrollOffset;
               }

               if (constraint) {
                   friction -= limitValue((BOUNCE_STOP - abs(constraint)) / BOUNCE_STOP, 0, 0.9);
                   velocity -= constraint * BOUNCE_DECELERATION;
               }

               decelerationVelocity = velocity;
               friction = limitValue(friction, 0, 1);
               updateScrollOffset(bounceLocation);

               if (endKineticAnimation()) {
                   return;
               }
           }

           queueNextStep();
       }

       function endKineticAnimation(forceEnd) {
           if (!forceEnd && abs(decelerationVelocity) > VELOCITY) {
               return false;
           }

           winding = false;
           clearTimeout(timeoutId);

           scrollbar.css(OPACITY, 0);
           return true;
       }

       function gestureStart() {
           dragCanceled = true;
       }

       function gestureEnd() {
           dragCanceled = true;
       }

       function init() {
           var scrollSize = scrollElement[0][scrollSizeName],
           scroll;

           boxSize = element[boxSizeName]();
           scroll = scrollSize - boxSize;
           enabled = scroll > 0;
           zoomLevel = kendo.support.zoomLevel();
           dip10 = 5 * zoomLevel;
           minLimit = boxSize * BOUNCE_LIMIT;
           maxLimit = scroll + minLimit;
           minStop = - BOUNCE_STOP;
           maxStop = scroll + BOUNCE_STOP;
           ratio = ~~(boxSize / scrollSize * boxSize);
           decelerationVelocity = 0;
           bounceLocation = 0;
           direction = 0;
           directionChange =+ new Date();
           scrollOffset = 0;
           friction = INITIAL_FRICTION;
       }

       element
           .bind("gesturestart", gestureStart)
           .bind("gestureend", gestureEnd)
           .bind(STARTEVENT, wait);

       init();
    }

    var Scroller = kendo.ui.MobileWidget.extend({
        init: function(element, options) {
            var that = this, scrollElement;

            Widget.fn.init.call(that, element, options);

            if (!support.mobileOS && !that.options.useOnDesktop) {
                that.element.bind("scroll", function() {
                    that.trigger("scroll", {x: that.element.scrollLeft(), y: that.element.scrollTop()});
                });

                return;
            }

            element = that.element;

            element
                .css("overflow", "hidden")
                .wrapInner('<div class="k-scroll-container"/>');

            scrollElement = element.children().first();

            transform = {x: 0, y: 0};

            function updateTransform(property, value) {
                value = round(value);
                if (value !== transform[property]) {
                    transform[property] = value;
                    scrollElement[0].style[TRANSFORMSTYLE] = to3DProperty(transform.x + PX + "," + transform.y + PX);
                    that.trigger("scroll", {x: -transform.x, y: -transform.y});
                }
            }

            Axis(scrollElement, "Width", updateTransform);
            Axis(scrollElement, "Height", updateTransform);

            if ($.browser.mozilla) {
                element.bind("mousedown", false);
            }
        },

        options: {
            name: "Scroller",
            selector: "[data-kendo-role=scroller]",
            useOnDesktop: true
        }
    });

    kendo.ui.plugin(Scroller);
})(jQuery);
