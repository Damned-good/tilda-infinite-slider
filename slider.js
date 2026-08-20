(function () {
    'use strict';

    var SETTINGS = {
        autoplay: false,
        autoplayDelay: 4000,
        animationDuration: 750,
        pauseOnHover: true,
        dragEnabled: true,
        dragThreshold: 45,
        dragResistance: 0.35
    };

    var SLIDER_SELECTOR = '.uc-slider1';
    var COPY_ATTRIBUTE = 'data-infinite-copy';

    function hasClass(element, name) {
        return element && (' ' + element.className + ' ').indexOf(' ' + name + ' ') !== -1;
    }

    function directSlides(parent) {
        var result = [];
        var children = parent.children;
        var i;

        for (i = 0; i < children.length; i += 1) {
            if (
                hasClass(children[i], 't396__group') &&
                hasClass(children[i], 'slide') &&
                !children[i].getAttribute(COPY_ATTRIBUTE)
            ) {
                result.push(children[i]);
            }
        }

        return result;
    }

    function layoutOffset(element, parent, property) {
        var value = 0;
        var node = element;

        while (node && node !== parent) {
            value += node[property] || 0;
            node = node.offsetParent;
        }

        return value;
    }

    function now() {
        return window.performance && window.performance.now
            ? window.performance.now()
            : new Date().getTime();
    }

    function ease(progress) {
        return progress < 0.5
            ? 4 * progress * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 3) / 2;
    }

    function initSlider(slider) {
        var container;
        var molecule;
        var slides;
        var prevButton;
        var nextButton;

        var positions = [];
        var widths = [];
        var base = 0;
        var cycle = 0;
        var viewportWidth = 0;
        var index = 0;
        var offset = 0;

        var frameId = null;
        var animating = false;
        var queuedSteps = 0;
        var autoplayId = null;
        var resizeId = null;
        var hovered = false;

        var dragging = false;
        var dragMoved = false;
        var dragAxis = '';
        var dragStartX = 0;
        var dragStartY = 0;
        var dragX = 0;
        var dragY = 0;
        var dragStartOffset = 0;

        if (slider.__tildaInfiniteSlider) {
            return true;
        }

        container = slider.querySelector('.t396__group.container.tn-group');
        if (!container) {
            return false;
        }

        molecule = container.querySelector('.tn-molecule');
        if (!molecule) {
            return false;
        }

        slides = directSlides(molecule);
        if (!slides.length || !container.offsetWidth) {
            return false;
        }

        function removeCopies() {
            var copies = molecule.querySelectorAll('[' + COPY_ATTRIBUTE + ']');
            var i;

            for (i = copies.length - 1; i >= 0; i -= 1) {
                if (copies[i].parentNode === molecule) {
                    molecule.removeChild(copies[i]);
                }
            }
        }

        function createCopy(source, left, top) {
            var copy = source.cloneNode(true);
            var images = copy.querySelectorAll('img');
            var i;
            var sourceUrl;

            copy.setAttribute(COPY_ATTRIBUTE, 'true');
            copy.setAttribute('aria-hidden', 'true');

            for (i = 0; i < images.length; i += 1) {
                sourceUrl =
                    images[i].getAttribute('data-original') ||
                    images[i].getAttribute('data-src');

                if (sourceUrl) {
                    images[i].setAttribute('src', sourceUrl);
                }

                images[i].classList.remove('t-img');
            }

            copy.style.setProperty('position', 'absolute', 'important');
            copy.style.setProperty('left', left + 'px', 'important');
            copy.style.setProperty('top', top + 'px', 'important');
            copy.style.setProperty('right', 'auto', 'important');
            copy.style.setProperty('bottom', 'auto', 'important');
            copy.style.setProperty('margin', '0', 'important');
            copy.style.setProperty('pointer-events', 'none', 'important');
            copy.style.setProperty('user-select', 'none', 'important');
            copy.style.setProperty('-webkit-user-select', 'none', 'important');

            return copy;
        }

        function measureAndBuild() {
            var gapSum = 0;
            var gapCount = 0;
            var seamGap;
            var repeatCount;
            var copyNumber;
            var left;
            var top;
            var i;

            removeCopies();
            positions = [];
            widths = [];
            base = layoutOffset(slides[0], molecule, 'offsetLeft');
            viewportWidth = container.offsetWidth;

            for (i = 0; i < slides.length; i += 1) {
                positions[i] = layoutOffset(slides[i], molecule, 'offsetLeft') - base;
                widths[i] = slides[i].offsetWidth;

                if (i > 0 && positions[i] >= positions[i - 1] + widths[i - 1]) {
                    gapSum += positions[i] - positions[i - 1] - widths[i - 1];
                    gapCount += 1;
                }
            }

            seamGap = gapCount ? gapSum / gapCount : 0;
            cycle = positions[slides.length - 1] + widths[slides.length - 1] + seamGap;

            if (!cycle || cycle < 0) {
                return false;
            }

            repeatCount = Math.ceil(
                viewportWidth * (1 + Math.max(0, Number(SETTINGS.dragResistance) || 0)) / cycle
            ) + 3;

            for (copyNumber = -repeatCount; copyNumber <= repeatCount; copyNumber += 1) {
                if (copyNumber === 0) {
                    continue;
                }

                for (i = 0; i < slides.length; i += 1) {
                    left = base + positions[i] + copyNumber * cycle;
                    top = layoutOffset(slides[i], molecule, 'offsetTop');
                    molecule.appendChild(createCopy(slides[i], left, top));
                }
            }

            return true;
        }

        function setOffset(value) {
            offset = value;
            molecule.style.setProperty(
                'transform',
                'translate3d(-' + value + 'px,0,0)',
                'important'
            );
        }

        function alignedOffset(slideIndex) {
            return base + positions[slideIndex];
        }

        function previousOffset() {
            return index > 0
                ? alignedOffset(index - 1)
                : base + positions[slides.length - 1] - cycle;
        }

        function nextOffset() {
            return index < slides.length - 1
                ? alignedOffset(index + 1)
                : base + cycle;
        }

        function visualScale() {
            var layoutWidth = container.offsetWidth;
            var visualWidth = container.getBoundingClientRect().width;
            var scale = visualWidth / layoutWidth;

            return isFinite(scale) && scale > 0 ? scale : 1;
        }

        function stopAnimation() {
            if (frameId !== null) {
                window.cancelAnimationFrame(frameId);
                frameId = null;
            }
            animating = false;
        }

        function flushQueue() {
            var direction;

            if (animating || dragging || !queuedSteps) {
                return;
            }

            direction = queuedSteps > 0 ? 1 : -1;
            queuedSteps -= direction;
            moveOne(direction);
        }

        function animateTo(target, complete) {
            var start = offset;
            var distance = target - start;
            var startTime = now();
            var duration = Math.max(0, Number(SETTINGS.animationDuration) || 0);

            stopAnimation();

            if (!duration || Math.abs(distance) < 0.5) {
                setOffset(target);
                if (complete) {
                    complete();
                }
                flushQueue();
                return;
            }

            animating = true;

            function draw(time) {
                var progress = Math.min(1, (time - startTime) / duration);

                setOffset(start + distance * ease(progress));

                if (progress < 1) {
                    frameId = window.requestAnimationFrame(draw);
                    return;
                }

                frameId = null;
                animating = false;
                setOffset(target);

                if (complete) {
                    complete();
                }

                flushQueue();
            }

            frameId = window.requestAnimationFrame(draw);
        }

        function moveOne(direction) {
            var target;
            var targetIndex;
            var normalized;

            if (slides.length < 2) {
                return;
            }

            if (direction > 0) {
                target = nextOffset();
                targetIndex = index < slides.length - 1 ? index + 1 : 0;
            } else {
                target = previousOffset();
                targetIndex = index > 0 ? index - 1 : slides.length - 1;
            }

            normalized = base + positions[targetIndex];

            animateTo(target, function () {
                index = targetIndex;
                setOffset(normalized);
            });
        }

        function requestStep(direction) {
            if (!direction || dragging || slides.length < 2) {
                return;
            }

            if (animating) {
                queuedSteps += direction > 0 ? 1 : -1;
                queuedSteps = Math.max(-3, Math.min(3, queuedSteps));
                return;
            }

            moveOne(direction);
        }

        function stopAutoplay() {
            if (autoplayId !== null) {
                window.clearInterval(autoplayId);
                autoplayId = null;
            }
        }

        function startAutoplay() {
            stopAutoplay();

            if (!SETTINGS.autoplay || slides.length < 2 || hovered) {
                return;
            }

            autoplayId = window.setInterval(function () {
                requestStep(1);
            }, Math.max(100, Number(SETTINGS.autoplayDelay) || 4000));
        }

        function resisted(value, boundary) {
            var overflow = value - boundary;
            var strength = Math.max(0, Number(SETTINGS.dragResistance) || 0);
            var limit = Math.max(1, viewportWidth * strength);

            return boundary + overflow * limit / (Math.abs(overflow) + limit);
        }

        function startDrag(x, y) {
            if (!SETTINGS.dragEnabled || animating) {
                return;
            }

            dragging = true;
            dragMoved = false;
            dragAxis = '';
            dragStartX = x;
            dragStartY = y;
            dragX = x;
            dragY = y;
            dragStartOffset = offset;
            container.style.cursor = 'grabbing';
            stopAutoplay();
        }

        function moveDrag(x, y, event) {
            var deltaX;
            var deltaY;
            var value;
            var minimum;
            var maximum;

            if (!dragging) {
                return;
            }

            dragX = x;
            dragY = y;
            deltaX = dragX - dragStartX;
            deltaY = dragY - dragStartY;

            if (!dragAxis) {
                if (Math.abs(deltaX) < 6 && Math.abs(deltaY) < 6) {
                    return;
                }

                dragAxis = Math.abs(deltaX) > Math.abs(deltaY) ? 'x' : 'y';

                if (dragAxis === 'y') {
                    dragging = false;
                    container.style.cursor = SETTINGS.dragEnabled ? 'grab' : 'default';
                    startAutoplay();
                    return;
                }
            }

            if (dragAxis !== 'x') {
                return;
            }

            dragMoved = true;
            if (event && event.cancelable) {
                event.preventDefault();
            }

            value = dragStartOffset - deltaX / visualScale();
            minimum = previousOffset();
            maximum = nextOffset();

            if (value < minimum) {
                value = resisted(value, minimum);
            } else if (value > maximum) {
                value = resisted(value, maximum);
            }

            setOffset(value);
        }

        function endDrag() {
            var deltaX;

            if (!dragging) {
                return;
            }

            dragging = false;
            container.style.cursor = SETTINGS.dragEnabled ? 'grab' : 'default';
            deltaX = dragX - dragStartX;

            if (!dragMoved || dragAxis !== 'x') {
                animateTo(alignedOffset(index));
            } else if (Math.abs(deltaX) >= SETTINGS.dragThreshold) {
                moveOne(deltaX < 0 ? 1 : -1);
            } else {
                animateTo(alignedOffset(index));
            }

            dragMoved = false;
            dragAxis = '';

            startAutoplay();
        }

        function bindButton(button, direction) {
            if (!button) {
                return;
            }

            button.style.cursor = 'pointer';
            button.style.userSelect = 'none';
            button.style.webkitUserSelect = 'none';
            button.addEventListener('click', function (event) {
                event.preventDefault();
                event.stopPropagation();
                requestStep(direction);
            }, false);
        }

        if (!measureAndBuild()) {
            return false;
        }

        slider.__tildaInfiniteSlider = true;
        prevButton = slider.querySelector('.slider-prev') || slider.querySelector('a[href="#prev"]');
        nextButton = slider.querySelector('.slider-next') || slider.querySelector('a[href="#next"]');

        container.style.setProperty('overflow', 'hidden', 'important');
        container.style.setProperty('touch-action', 'pan-y', 'important');
        container.style.cursor = SETTINGS.dragEnabled ? 'grab' : 'default';
        molecule.style.setProperty('will-change', 'transform', 'important');
        molecule.style.setProperty('transition', 'none', 'important');

        bindButton(prevButton, -1);
        bindButton(nextButton, 1);
        setOffset(alignedOffset(0));

        if (SETTINGS.pauseOnHover) {
            container.addEventListener('mouseenter', function () {
                hovered = true;
                stopAutoplay();
            }, false);
            container.addEventListener('mouseleave', function () {
                hovered = false;
                startAutoplay();
            }, false);
        }

        if (SETTINGS.dragEnabled) {
            container.addEventListener('mousedown', function (event) {
                if (event.button !== 0) {
                    return;
                }
                startDrag(event.clientX, event.clientY);
            }, false);

            window.addEventListener('mousemove', function (event) {
                moveDrag(event.clientX, event.clientY, event);
            }, false);

            window.addEventListener('mouseup', endDrag, false);

            container.addEventListener('touchstart', function (event) {
                if (!event.touches.length) {
                    return;
                }
                startDrag(event.touches[0].clientX, event.touches[0].clientY);
            }, false);

            container.addEventListener('touchmove', function (event) {
                if (event.touches.length) {
                    moveDrag(event.touches[0].clientX, event.touches[0].clientY, event);
                }
            }, false);

            container.addEventListener('touchend', endDrag, false);
            container.addEventListener('touchcancel', endDrag, false);
            container.addEventListener('dragstart', function (event) {
                event.preventDefault();
            }, false);
        }

        window.addEventListener('resize', function () {
            window.clearTimeout(resizeId);
            resizeId = window.setTimeout(function () {
                stopAnimation();
                queuedSteps = 0;
                if (measureAndBuild()) {
                    setOffset(alignedOffset(index));
                }
            }, 250);
        }, false);

        startAutoplay();
        return true;
    }

    function initAll() {
        var sliders = document.querySelectorAll(SLIDER_SELECTOR);
        var i;

        for (i = 0; i < sliders.length; i += 1) {
            initSlider(sliders[i]);
        }
    }

    function boot() {
        var attempt = 0;

        function scan() {
            initAll();
            attempt += 1;

            if (attempt < 8) {
                window.setTimeout(scan, 300);
            }
        }

        window.setTimeout(scan, 500);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot, false);
    } else {
        boot();
    }
}());

