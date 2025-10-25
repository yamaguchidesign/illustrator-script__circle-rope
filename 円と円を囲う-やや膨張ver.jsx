// 杭と杭をロープで囲うスクリプト - Illustrator用 ExtendScript

// ============================================================
// 設定項目（編集可能）
// ============================================================
var CIRCLE_OFFSET_DEGREES = 8;      // 円周上のずらし量（度）
var HANDLE_LENGTH_RATIO = 0.1;      // ハンドルの長さ比率（実際の膨らみ制御）
// ============================================================

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
            // 各円の中心座標と半径を取得（重ね順情報付き）
            var circles = [];
            for (var i = 0; i < sel.length; i++) {
                var obj = sel[i];
                var center = [
                    obj.position[0] + obj.width / 2,
                    obj.position[1] - obj.height / 2
                ];
                var radius = Math.max(obj.width, obj.height) / 2;

                // 重ね順を取得（エラー処理付き）
                var zOrder = 0;
                try {
                    if (typeof obj.zOrderPosition !== "undefined") {
                        zOrder = obj.zOrderPosition;
                    }
                } catch (e) {
                    zOrder = i; // フォールバック：選択順序を使用
                }

                circles.push({
                    center: center,
                    radius: radius,
                    zOrder: zOrder,
                    originalIndex: i // デバッグ用
                });
            }

            // 重ね順で並び替え（手前が先頭、奥が後）
            circles.sort(function (a, b) {
                return b.zOrder - a.zOrder; // 降順：高いzOrder（手前）が先
            });

            // 最前面の円の色を取得
            var frontmostColor = getFrontmostCircleColor(sel);

            // 円と円を繋ぐロープの線を計算
            var ropeSegments = calculateRopeSegments(circles);

            if (ropeSegments.length > 0) {
                // 円の数に応じて描画方法を変更
                if (circles.length === 2) {
                    // 2つの円の場合は膨らんだ四角形
                    var rectanglePaths = createRectanglePaths(ropeSegments, frontmostColor);

                    for (var r = 0; r < rectanglePaths.length; r++) {
                        var rectPath = doc.pathItems.add();
                        rectPath.stroked = false;
                        rectPath.filled = true;
                        rectPath.closed = true;
                        rectPath.fillColor = frontmostColor;

                        var rectangle = rectanglePaths[r];
                        // 膨らみを考慮したベジェ曲線でパスポイントを設定
                        for (var i = 0; i < rectangle.points.length; i++) {
                            var pt = rectPath.pathPoints.add();
                            var pointInfo = rectangle.points[i];
                            pt.anchor = pointInfo.anchor;
                            pt.leftDirection = pointInfo.leftDirection;
                            pt.rightDirection = pointInfo.rightDirection;
                        }
                    }
                } else {
                    // 3つ以上の円の場合は全てのペアを四角形で繋いで結合
                    var createdPaths = createAllPairRectangles(circles, frontmostColor, doc);

                    if (createdPaths.length > 0) {
                        // 作成した四角形を結合して隙間を埋める
                        combineRectanglesAndFillGaps(createdPaths, circles, frontmostColor, doc);
                    }
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

// 膨らんだ四角形のパスを作成する関数
function createRectanglePaths(ropeSegments, color) {
    var rectangles = [];

    // 2つずつのセグメントから膨らんだ四角形を作成
    for (var i = 0; i < ropeSegments.length; i += 2) {
        if (i + 1 < ropeSegments.length) {
            var segment1 = ropeSegments[i];     // 上の線（膨らみ情報付き）
            var segment2 = ropeSegments[i + 1]; // 下の線（膨らみ情報付き）

            // 制御点距離の設定
            var controlDist = Math.min(
                Math.sqrt((segment1.end[0] - segment1.start[0]) * (segment1.end[0] - segment1.start[0]) +
                    (segment1.end[1] - segment1.start[1]) * (segment1.end[1] - segment1.start[1])),
                Math.sqrt((segment2.end[0] - segment2.start[0]) * (segment2.end[0] - segment2.start[0]) +
                    (segment2.end[1] - segment2.start[1]) * (segment2.end[1] - segment2.start[1]))
            ) * HANDLE_LENGTH_RATIO;

            // アンカーポイントの定義（重ね順ベース、配置角度に依存しない）
            // segment1 = 第1外接線、segment2 = 第2外接線
            // 手前の円(circle1)から奥の円(circle2)への一貫した順序
            var A = segment1.start;  // 第1外接線の手前の円側（アンカーポイントA）
            var B = segment1.end;    // 第1外接線の奥の円側（アンカーポイントB）
            var C = segment2.start;  // 第2外接線の手前の円側（アンカーポイントC）
            var D = segment2.end;    // 第2外接線の奥の円側（アンカーポイントD）

            // ハンドルAB：Aから円ABの接線方向（180度回転）
            var handleAB = [
                A[0] + controlDist * Math.cos((segment1.startTangentAngle || 0) + Math.PI),
                A[1] + controlDist * Math.sin((segment1.startTangentAngle || 0) + Math.PI)
            ];

            // ハンドルBA：Bから円ABの接線方向（180度回転）
            var handleBA = [
                B[0] + controlDist * Math.cos((segment1.endTangentAngle || 0) + 2 * Math.PI),
                B[1] + controlDist * Math.sin((segment1.endTangentAngle || 0) + 2 * Math.PI)
            ];

            // ハンドルCD：Cから円CDの接線方向（180度回転）
            var handleCD = [
                C[0] + controlDist * Math.cos((segment2.startTangentAngle || 0) + 2 * Math.PI),
                C[1] + controlDist * Math.sin((segment2.startTangentAngle || 0) + 2 * Math.PI)
            ];

            // ハンドルDC：Dから円CDの接線方向（外側に広がる）- BAパターンに合わせて+Math.PI
            var handleDC = [
                D[0] + controlDist * Math.cos((segment2.endTangentAngle || 0) + Math.PI),
                D[1] + controlDist * Math.sin((segment2.endTangentAngle || 0) + Math.PI)
            ];

            // 膨らんだ四角形のパスポイント情報を作成（時計回り）
            // 重ね順ベース：AC、BDを直線、AB、CDをカーブ（配置角度に依存しない）
            var rectangle = {
                points: [
                    {
                        // アンカーポイントA（第1外接線の手前側）
                        anchor: A,
                        leftDirection: A,         // ハンドルAC = 直線（円内通過）
                        rightDirection: handleAB  // ハンドルAB = カーブ（円間接続）
                    },
                    {
                        // アンカーポイントB（第1外接線の奥側）
                        anchor: B,
                        leftDirection: handleBA,  // ハンドルBA = カーブ（円間接続）
                        rightDirection: B         // ハンドルBD = 直線（円内通過）
                    },
                    {
                        // アンカーポイントD（第2外接線の奥側）
                        anchor: D,
                        leftDirection: D,         // ハンドルDB = 直線（円内通過）
                        rightDirection: handleDC  // ハンドルDC = カーブ（円間接続）
                    },
                    {
                        // アンカーポイントC（第2外接線の手前側）
                        anchor: C,
                        leftDirection: handleCD,  // ハンドルCD = カーブ（円間接続）
                        rightDirection: C         // ハンドルCA = 直線（円内通過）
                    }
                ]
            };

            rectangles.push(rectangle);
        }
    }

    return rectangles;
}

// 全ての円のペアを四角形で繋ぐ関数（3つ以上の円用）
function createAllPairRectangles(circles, color, doc) {
    var createdPaths = []; // 作成したパスアイテムを保存

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

                // 膨らんだ四角形をドキュメントに追加
                for (var r = 0; r < rectanglePaths.length; r++) {
                    var rectPath = doc.pathItems.add();
                    rectPath.stroked = false;
                    rectPath.filled = true;
                    rectPath.closed = true;
                    rectPath.fillColor = color;

                    var rectangle = rectanglePaths[r];
                    // 膨らみを考慮したベジェ曲線でパスポイントを設定
                    for (var k = 0; k < rectangle.points.length; k++) {
                        var pt = rectPath.pathPoints.add();
                        var pointInfo = rectangle.points[k];
                        pt.anchor = pointInfo.anchor;
                        pt.leftDirection = pointInfo.leftDirection;
                        pt.rightDirection = pointInfo.rightDirection;
                    }

                    // 作成したパスをリストに追加
                    createdPaths.push(rectPath);
                }
            }
        }
    }

    return createdPaths;
}

// 作成した四角形を結合して隙間を埋める関数
function combineRectanglesAndFillGaps(pathItems, circles, color, doc) {
    try {
        // 3つの円の場合、中央の隙間を埋める三角形を作成
        if (circles.length === 3) {
            createCenterTriangleForThreeCircles(circles, color, doc);
        }
        // 4つ以上の円の場合、中央の多角形を作成
        else if (circles.length >= 4) {
            createCenterPolygonForMultipleCircles(circles, color, doc);
        }

        // 選択状態をクリア
        doc.selection = null;

    } catch (e) {
        // エラーが発生しても処理を続行
        try {
            doc.selection = null;
        } catch (e2) {
            // 何もしない
        }
    }
}

// 3つの円の中央の隙間を埋める三角形を作成する関数
function createCenterTriangleForThreeCircles(circles, color, doc) {
    try {
        // 3つの円の中心点で三角形を作成
        if (circles.length === 3) {
            var trianglePath = doc.pathItems.add();
            trianglePath.stroked = false;
            trianglePath.filled = true;
            trianglePath.closed = true;
            trianglePath.fillColor = color;

            // 三角形の頂点を追加（円の中心点）
            for (var i = 0; i < circles.length; i++) {
                var pt = trianglePath.pathPoints.add();
                pt.anchor = circles[i].center;
                pt.leftDirection = circles[i].center;
                pt.rightDirection = circles[i].center;
            }
        }

    } catch (e) {
        // エラーが発生しても処理を続行
    }
}

// 4つ以上の円の中央の隙間を埋める多角形を作成する関数
function createCenterPolygonForMultipleCircles(circles, color, doc) {
    try {
        // 全ての円の中心を計算
        var centerX = 0, centerY = 0;
        for (var i = 0; i < circles.length; i++) {
            centerX += circles[i].center[0];
            centerY += circles[i].center[1];
        }
        centerX /= circles.length;
        centerY /= circles.length;

        // 円の中心点を角度でソート
        var pointsWithAngle = [];
        for (var i = 0; i < circles.length; i++) {
            var angle = Math.atan2(circles[i].center[1] - centerY, circles[i].center[0] - centerX);
            pointsWithAngle.push({
                point: circles[i].center,
                angle: angle
            });
        }

        // 角度でソート
        pointsWithAngle.sort(function (a, b) {
            return a.angle - b.angle;
        });

        // 中央の多角形を作成
        var polygonPath = doc.pathItems.add();
        polygonPath.stroked = false;
        polygonPath.filled = true;
        polygonPath.closed = true;
        polygonPath.fillColor = color;

        // 多角形の頂点を追加
        for (var i = 0; i < pointsWithAngle.length; i++) {
            var pt = polygonPath.pathPoints.add();
            pt.anchor = pointsWithAngle[i].point;
            pt.leftDirection = pointsWithAngle[i].point;
            pt.rightDirection = pointsWithAngle[i].point;
        }

    } catch (e) {
        // エラーが発生しても処理を続行
    }
}

// 円と円を繋ぐロープセグメントを計算する関数
function calculateRopeSegments(circles) {
    var segments = [];

    if (circles.length < 2) return segments;

    // 全ての円ペアについて外接線を計算
    // 重ね順により、circles[i]は常にcircles[j]より手前
    for (var i = 0; i < circles.length; i++) {
        for (var j = i + 1; j < circles.length; j++) {
            // circle1=手前の円、circle2=奥の円として一貫した順序で計算
            var tangents = calculateExternalTangents(circles[i], circles[j]);
            for (var t = 0; t < tangents.length; t++) {
                segments.push(tangents[t]);
            }
        }
    }

    return segments;
}

// 外接線に膨らみを追加する関数
function addBulgeToSegment(segment, bulgeRatio, isTopSegment) {
    try {
        // 膨らみの強さ（デフォルト0.2 = 20%）
        if (typeof bulgeRatio === "undefined") {
            bulgeRatio = 0.2;
        }

        var start = segment.start;
        var end = segment.end;

        // 線分の中点を計算
        var midX = (start[0] + end[0]) / 2;
        var midY = (start[1] + end[1]) / 2;

        // 線分の方向ベクトル
        var dx = end[0] - start[0];
        var dy = end[1] - start[1];
        var length = Math.sqrt(dx * dx + dy * dy);

        // 膨らみ方向（線分に垂直）
        var perpX = -dy / length;
        var perpY = dx / length;

        // 上辺は上方向に、下辺は下方向に膨らませる
        if (typeof isTopSegment !== "undefined") {
            if (isTopSegment) {
                // 上辺：必ず上方向（Y軸負方向）に膨らませる
                if (perpY > 0) {
                    perpX = -perpX;
                    perpY = -perpY;
                }
                // 確実に上方向にするため、Y成分を負にする
                if (perpY > 0) {
                    perpY = -Math.abs(perpY);
                }
            } else {
                // 下辺：必ず下方向（Y軸正方向）に膨らませる
                if (perpY < 0) {
                    perpX = -perpX;
                    perpY = -perpY;
                }
                // 確実に下方向にするため、Y成分を正にする
                if (perpY < 0) {
                    perpY = Math.abs(perpY);
                }
            }
        }

        // 膨らみの大きさ（線分の長さに比例）
        var bulgeDistance = length * bulgeRatio;

        // 膨らんだ中点
        var bulgedMid = [
            midX + perpX * bulgeDistance,
            midY + perpY * bulgeDistance
        ];

        // ベジェ制御点を計算
        var control1, control2;

        // 接線方向の情報がある場合はそれを使用してスムーズ接続
        if (typeof segment.startTangentAngle !== "undefined" && typeof segment.endTangentAngle !== "undefined") {
            // 接線方向に沿った制御点を生成（接続をスムーズにするため）
            var controlDistance = length * 0.2; // 線分の20%の距離に短縮

            // 線分の方向ベクトル
            var lineAngle = Math.atan2(end[1] - start[1], end[0] - start[0]);

            // 開始点の制御点：円の接線方向から線分方向へのブレンド
            var startTangentBlend = 0.3; // 30%接線方向、70%線分方向
            var startControlAngle = segment.startTangentAngle * startTangentBlend + lineAngle * (1 - startTangentBlend);

            var tangentControl1 = [
                start[0] + controlDistance * Math.cos(startControlAngle),
                start[1] + controlDistance * Math.sin(startControlAngle)
            ];

            // 終了点の制御点：線分方向から円の接線方向へのブレンド
            var endTangentBlend = 0.3; // 30%接線方向、70%線分方向  
            var endControlAngle = segment.endTangentAngle * endTangentBlend + lineAngle * (1 - endTangentBlend);

            var tangentControl2 = [
                end[0] - controlDistance * Math.cos(endControlAngle),
                end[1] - controlDistance * Math.sin(endControlAngle)
            ];

            // 膨らみ効果も加える（軽めに）
            var bulgeControl1 = [
                start[0] + (bulgedMid[0] - start[0]) * 0.2,  // 膨らみを軽くする
                start[1] + (bulgedMid[1] - start[1]) * 0.2
            ];

            var bulgeControl2 = [
                end[0] + (bulgedMid[0] - end[0]) * 0.2,     // 膨らみを軽くする
                end[1] + (bulgedMid[1] - end[1]) * 0.2
            ];

            // 接線方向制御点をベースにして、膨らみをわずかに加える
            control1 = [
                tangentControl1[0] + (bulgeControl1[0] - start[0]) * 0.3,
                tangentControl1[1] + (bulgeControl1[1] - start[1]) * 0.3
            ];

            control2 = [
                tangentControl2[0] + (bulgeControl2[0] - end[0]) * 0.3,
                tangentControl2[1] + (bulgeControl2[1] - end[1]) * 0.3
            ];
        } else {
            // 従来の膨らみベース制御点
            control1 = [
                start[0] + (bulgedMid[0] - start[0]) * 0.33,
                start[1] + (bulgedMid[1] - start[1]) * 0.33
            ];

            control2 = [
                end[0] + (bulgedMid[0] - end[0]) * 0.33,
                end[1] + (bulgedMid[1] - end[1]) * 0.33
            ];
        }

        return {
            start: start,
            end: end,
            control1: control1,
            control2: control2,
            bulgedMid: bulgedMid,
            startTangentAngle: segment.startTangentAngle,
            endTangentAngle: segment.endTangentAngle
        };

    } catch (e) {
        // エラーの場合は直線として返す
        return {
            start: segment.start,
            end: segment.end,
            control1: segment.start,
            control2: segment.end,
            bulgedMid: [(segment.start[0] + segment.end[0]) / 2, (segment.start[1] + segment.end[1]) / 2],
            startTangentAngle: segment.startTangentAngle,
            endTangentAngle: segment.endTangentAngle
        };
    }
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

    // 接点を円周上で少しずらすための角度オフセット（設定から取得）
    var angleOffset = CIRCLE_OFFSET_DEGREES * Math.PI / 180; // 度からラジアンに変換

    // 第1の外接線（上側）
    var angle1 = centerAngle - alpha;
    var perpAngle1 = angle1 + Math.PI / 2;

    // 接点を少しずらす
    var offsetAngle1_1 = perpAngle1 + angleOffset;
    var offsetAngle1_2 = perpAngle1 - angleOffset;

    var p1_top = [c1[0] + r1 * Math.cos(offsetAngle1_1), c1[1] + r1 * Math.sin(offsetAngle1_1)];
    var p2_top = [c2[0] + r2 * Math.cos(offsetAngle1_2), c2[1] + r2 * Math.sin(offsetAngle1_2)];

    // 第2の外接線（下側）
    var angle2 = centerAngle + alpha;
    var perpAngle2 = angle2 - Math.PI / 2;

    // 接点を少しずらす（上側と逆方向）
    var offsetAngle2_1 = perpAngle2 - angleOffset;
    var offsetAngle2_2 = perpAngle2 + angleOffset;

    var p1_bottom = [c1[0] + r1 * Math.cos(offsetAngle2_1), c1[1] + r1 * Math.sin(offsetAngle2_1)];
    var p2_bottom = [c2[0] + r2 * Math.cos(offsetAngle2_2), c2[1] + r2 * Math.sin(offsetAngle2_2)];

    // 外接線が実際に円の外側を通ることを確認
    if (isLineOutsideCircles(p1_top, p2_top, circle1, circle2) &&
        isLineOutsideCircles(p1_bottom, p2_bottom, circle1, circle2)) {

        // 接点での円の接線方向を計算してスムーズ接続用の制御点を追加
        var topSegment = {
            start: p1_top,
            end: p2_top,
            startTangentAngle: offsetAngle1_1 + Math.PI / 2, // 円1の接線方向
            endTangentAngle: offsetAngle1_2 + Math.PI / 2    // 円2の接線方向
        };
        var bottomSegment = {
            start: p1_bottom,
            end: p2_bottom,
            startTangentAngle: offsetAngle2_1 + Math.PI / 2, // 円1の接線方向
            endTangentAngle: offsetAngle2_2 + Math.PI / 2    // 円2の接線方向
        };

        var bulgedTop = addBulgeToSegment(topSegment, 0.15, true); // 上辺：上方向に膨らみ（固定値）
        var bulgedBottom = addBulgeToSegment(bottomSegment, 0.15, false); // 下辺：下方向に膨らみ（固定値）

        segments.push(bulgedTop);
        segments.push(bulgedBottom);
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