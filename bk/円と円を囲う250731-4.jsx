// 杭と杭をロープで囲うスクリプト - Illustrator用 ExtendScript
if (app.documents.length > 0 && app.activeDocument.selection.length >= 2) {
    var doc = app.activeDocument;
    var sel = doc.selection;

    // 選択されたオブジェクトがすべて円かチェック
    var allCircles = true;
    var invalidObjectType = "";
    for (var i = 0; i < sel.length; i++) {
        if (sel[i].typename != "PathItem") {
            allCircles = false;
            invalidObjectType = "パス以外のオブジェクト";
            break;
        }

        // 円の形状かどうかをチェック
        if (!isCircularShape(sel[i])) {
            allCircles = false;
            invalidObjectType = "楕円または四角形などの非円形オブジェクト";
            break;
        }
    }

    if (allCircles) {
        try {
            // 各円の中心座標と半径を取得
            var circles = [];
            for (var i = 0; i < sel.length; i++) {
                var obj = sel[i];
                var center = [
                    obj.position[0] + obj.width / 2,
                    obj.position[1] - obj.height / 2
                ];
                var radius = Math.max(obj.width, obj.height) / 2;
                circles.push({
                    center: center,
                    radius: radius // ロープが杭に接するように
                });
            }

            // 最前面の円の色を取得
            var frontmostColor = getFrontmostCircleColor(sel);

            // 円と円を繋ぐロープの線を計算
            var ropeSegments = calculateRopeSegments(circles);

            if (ropeSegments.length > 0) {
                // 円の数に応じて描画方法を変更
                if (circles.length === 2) {
                    // 2つの円の場合は四角形
                    var rectanglePaths = createRectanglePaths(ropeSegments, frontmostColor);

                    for (var r = 0; r < rectanglePaths.length; r++) {
                        var rectPath = doc.pathItems.add();
                        rectPath.stroked = false;
                        rectPath.filled = true;
                        rectPath.closed = true;
                        rectPath.fillColor = frontmostColor;

                        var rectangle = rectanglePaths[r];
                        for (var i = 0; i < rectangle.length; i++) {
                            var pt = rectPath.pathPoints.add();
                            pt.anchor = rectangle[i];
                            pt.leftDirection = rectangle[i];
                            pt.rightDirection = rectangle[i];
                        }
                    }
                } else {
                    // 3つ以上の円の場合は全てのペアを四角形で繋ぐ
                    createAllPairRectangles(circles, frontmostColor, doc);
                }
            } else {
                alert("ロープセグメントを計算できませんでした。");
            }
        } catch (e) {
            alert("エラーが発生しました: " + e.message);
        }
    } else {
        alert("エラー: " + invalidObjectType + "が含まれています。このスクリプトは正円（真円）のみに対応しています。");
    }
} else {
    alert("2つ以上のパス（円）を選んでください。");
}

// オブジェクトが円の形状かどうかをチェックする関数
function isCircularShape(obj) {
    try {
        // パスオブジェクトでない場合は円ではない
        if (obj.typename !== "PathItem") {
            return false;
        }

        // 幅と高さを取得
        var width = Math.abs(obj.width);
        var height = Math.abs(obj.height);

        // 幅または高さが0の場合は円ではない
        if (width === 0 || height === 0) {
            return false;
        }

        // 幅と高さの比率をチェック（許容誤差5%）
        var ratio = width / height;
        var tolerance = 0.05; // 5%の許容誤差

        if (ratio < (1 - tolerance) || ratio > (1 + tolerance)) {
            return false; // 楕円または他の形状
        }

        // パスポイントの数をチェック（円は通常4つのパスポイント）
        if (obj.pathPoints.length < 4) {
            return false; // 三角形など
        }

        // 四角形の検出：パスポイントが4つで直線的な場合
        if (obj.pathPoints.length === 4) {
            var hasValidCurves = false;
            for (var i = 0; i < obj.pathPoints.length; i++) {
                var point = obj.pathPoints[i];
                // ベジェハンドルがあるかチェック（円の場合は必要）
                var leftHandle = point.leftDirection;
                var rightHandle = point.rightDirection;
                var anchor = point.anchor;

                // ハンドルが錨点と異なる位置にある場合（カーブがある）
                if ((leftHandle[0] !== anchor[0] || leftHandle[1] !== anchor[1]) ||
                    (rightHandle[0] !== anchor[0] || rightHandle[1] !== anchor[1])) {
                    hasValidCurves = true;
                    break;
                }
            }

            // 4つのポイントがすべて直線的な場合は四角形
            if (!hasValidCurves) {
                return false;
            }
        }

        return true; // 円と判定

    } catch (e) {
        // エラーが発生した場合は円ではないと判定
        return false;
    }
}

// 色を作成する関数
function createColor(r, g, b) {
    var color = new RGBColor();
    color.red = r;
    color.green = g;
    color.blue = b;
    return color;
}

// 最前面の円の色を取得する関数
function getFrontmostCircleColor(selection) {
    var frontmostItem = null;
    var topPosition = -1;

    // 最前面のオブジェクトを見つける
    for (var i = 0; i < selection.length; i++) {
        try {
            if (typeof selection[i].zOrderPosition !== "undefined") {
                if (selection[i].zOrderPosition > topPosition) {
                    topPosition = selection[i].zOrderPosition;
                    frontmostItem = selection[i];
                }
            } else {
                // zOrderPositionが使用できない場合は最初のオブジェクトを使用
                if (frontmostItem === null) {
                    frontmostItem = selection[i];
                }
            }
        } catch (e) {
            // エラーが発生した場合は最初のオブジェクトを使用
            if (frontmostItem === null) {
                frontmostItem = selection[i];
            }
        }
    }

    // 最前面のオブジェクトが見つからない場合は最初のオブジェクトを使用
    if (frontmostItem === null) {
        frontmostItem = selection[0];
    }

    return getObjectColor(frontmostItem);
}

// オブジェクトの色を取得する関数
function getObjectColor(obj) {
    try {
        // フィル色を優先
        if (obj.filled && obj.fillColor) {
            return copyColor(obj.fillColor);
        }

        // フィルがない場合はストローク色
        if (obj.stroked && obj.strokeColor) {
            return copyColor(obj.strokeColor);
        }

        // どちらもない場合はデフォルトの黒
        return createColor(0, 0, 0);
    } catch (e) {
        // エラーの場合はデフォルトの黒
        return createColor(0, 0, 0);
    }
}

// 色をコピーする関数
function copyColor(originalColor) {
    try {
        if (originalColor.typename === "RGBColor") {
            var newColor = new RGBColor();
            newColor.red = originalColor.red;
            newColor.green = originalColor.green;
            newColor.blue = originalColor.blue;
            return newColor;
        } else if (originalColor.typename === "CMYKColor") {
            // CMYKをRGBに概算変換
            var c = originalColor.cyan / 100;
            var m = originalColor.magenta / 100;
            var y = originalColor.yellow / 100;
            var k = originalColor.black / 100;

            var r = 255 * (1 - c) * (1 - k);
            var g = 255 * (1 - m) * (1 - k);
            var b = 255 * (1 - y) * (1 - k);

            return createColor(Math.round(r), Math.round(g), Math.round(b));
        } else if (originalColor.typename === "GrayColor") {
            // グレーをRGBに変換
            var gray = Math.round(255 * (100 - originalColor.gray) / 100);
            return createColor(gray, gray, gray);
        } else {
            // その他の色形式の場合はデフォルトの黒
            return createColor(0, 0, 0);
        }
    } catch (e) {
        // エラーの場合はデフォルトの黒
        return createColor(0, 0, 0);
    }
}

// 四角形のパスを作成する関数
function createRectanglePaths(ropeSegments, color) {
    var rectangles = [];

    // 2つずつのセグメントから四角形を作成
    for (var i = 0; i < ropeSegments.length; i += 2) {
        if (i + 1 < ropeSegments.length) {
            var segment1 = ropeSegments[i];     // 上の線
            var segment2 = ropeSegments[i + 1]; // 下の線

            // 四角形の4つの頂点を時計回りに配置
            var rectangle = [
                segment1.start,  // 左上
                segment1.end,    // 右上
                segment2.end,    // 右下
                segment2.start   // 左下
            ];

            rectangles.push(rectangle);
        }
    }

    return rectangles;
}

// 全ての円のペアを四角形で繋ぐ関数（3つ以上の円用）
function createAllPairRectangles(circles, color, doc) {
    // 全ての円ペアの組み合わせを生成
    for (var i = 0; i < circles.length; i++) {
        for (var j = i + 1; j < circles.length; j++) {
            var circle1 = circles[i];
            var circle2 = circles[j];

            // この2つの円の外接線を計算
            var tangents = calculateExternalTangents(circle1, circle2);

            if (tangents.length >= 2) {
                // 外接線から四角形を作成
                var rectanglePaths = createRectanglePaths(tangents, color);

                // 四角形をドキュメントに追加
                for (var r = 0; r < rectanglePaths.length; r++) {
                    var rectPath = doc.pathItems.add();
                    rectPath.stroked = false;
                    rectPath.filled = true;
                    rectPath.closed = true;
                    rectPath.fillColor = color;

                    var rectangle = rectanglePaths[r];
                    for (var k = 0; k < rectangle.length; k++) {
                        var pt = rectPath.pathPoints.add();
                        pt.anchor = rectangle[k];
                        pt.leftDirection = rectangle[k];
                        pt.rightDirection = rectangle[k];
                    }
                }
            }
        }
    }
}

// 円と円を繋ぐロープセグメントを計算する関数
function calculateRopeSegments(circles) {
    var segments = [];

    if (circles.length < 2) return segments;

    // 全ての円ペアについて外接線を計算
    for (var i = 0; i < circles.length; i++) {
        for (var j = i + 1; j < circles.length; j++) {
            var tangents = calculateExternalTangents(circles[i], circles[j]);
            for (var t = 0; t < tangents.length; t++) {
                segments.push(tangents[t]);
            }
        }
    }

    return segments;
}

// 2つの円の外接線を計算する関数
function calculateExternalTangents(circle1, circle2) {
    var segments = [];
    var c1 = circle1.center;
    var c2 = circle2.center;
    var r1 = circle1.radius;
    var r2 = circle2.radius;

    // 円心間の距離
    var dx = c2[0] - c1[0];
    var dy = c2[1] - c1[1];
    var d = Math.sqrt(dx * dx + dy * dy);

    // 円が近すぎる場合は線を引かない
    if (d < Math.abs(r1 - r2) + 10) {
        return segments;
    }

    // 正確な外共通接線を計算
    var centerAngle = Math.atan2(dy, dx);

    // 半径差による角度補正
    var radiusDiff = r1 - r2;
    var alpha = 0;

    // 外接線の角度を計算
    if (Math.abs(radiusDiff) < d) {
        alpha = Math.asin(radiusDiff / d);
    }

    // 第1の外接線（上側）
    var angle1 = centerAngle - alpha;
    var perpAngle1 = angle1 + Math.PI / 2;

    var p1_top = [c1[0] + r1 * Math.cos(perpAngle1), c1[1] + r1 * Math.sin(perpAngle1)];
    var p2_top = [c2[0] + r2 * Math.cos(perpAngle1), c2[1] + r2 * Math.sin(perpAngle1)];

    // 第2の外接線（下側）
    var angle2 = centerAngle + alpha;
    var perpAngle2 = angle2 - Math.PI / 2;

    var p1_bottom = [c1[0] + r1 * Math.cos(perpAngle2), c1[1] + r1 * Math.sin(perpAngle2)];
    var p2_bottom = [c2[0] + r2 * Math.cos(perpAngle2), c2[1] + r2 * Math.sin(perpAngle2)];

    // 外接線が実際に円の外側を通ることを確認
    if (isLineOutsideCircles(p1_top, p2_top, circle1, circle2) &&
        isLineOutsideCircles(p1_bottom, p2_bottom, circle1, circle2)) {
        segments.push({ start: p1_top, end: p2_top });
        segments.push({ start: p1_bottom, end: p2_bottom });
    }

    return segments;
}

// 線が両方の円の外側を通っているかチェックする関数
function isLineOutsideCircles(p1, p2, circle1, circle2) {
    // 円1の中心から線までの距離が半径より大きいかチェック
    var dist1 = distanceFromPointToLine(circle1.center, p1, p2);
    if (dist1 < circle1.radius - 1) return false;

    // 円2の中心から線までの距離が半径より大きいかチェック
    var dist2 = distanceFromPointToLine(circle2.center, p1, p2);
    if (dist2 < circle2.radius - 1) return false;

    return true;
}

// 点から線分までの最短距離を計算する関数
function distanceFromPointToLine(point, lineStart, lineEnd) {
    var A = point[0] - lineStart[0];
    var B = point[1] - lineStart[1];
    var C = lineEnd[0] - lineStart[0];
    var D = lineEnd[1] - lineStart[1];

    var dot = A * C + B * D;
    var lenSq = C * C + D * D;

    if (lenSq === 0) {
        // 線分が点の場合
        return Math.sqrt(A * A + B * B);
    }

    var param = dot / lenSq;

    var xx, yy;

    if (param < 0) {
        xx = lineStart[0];
        yy = lineStart[1];
    } else if (param > 1) {
        xx = lineEnd[0];
        yy = lineEnd[1];
    } else {
        xx = lineStart[0] + param * C;
        yy = lineStart[1] + param * D;
    }

    var dx = point[0] - xx;
    var dy = point[1] - yy;

    return Math.sqrt(dx * dx + dy * dy);
}