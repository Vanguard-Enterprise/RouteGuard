#include "localstore.h"

#include <QDir>
#include <QJsonDocument>
#include <QSqlDatabase>
#include <QSqlQuery>
#include <QStandardPaths>
#include <QUuid>

LocalStore::LocalStore(QObject *parent) : QObject(parent) {}

QString LocalStore::connectionName() const {
    return "routeguard-bus-store";
}

QString LocalStore::databasePath() const {
    const QString base = QStandardPaths::writableLocation(QStandardPaths::AppDataLocation);
    QDir().mkpath(base);
    return base + "/routeguard-bus.sqlite";
}

bool LocalStore::initialize() {
    QSqlDatabase db = QSqlDatabase::contains(connectionName())
        ? QSqlDatabase::database(connectionName())
        : QSqlDatabase::addDatabase("QSQLITE", connectionName());
    db.setDatabaseName(databasePath());
    if (!db.open()) {
        return false;
    }

    QSqlQuery query(db);
    return query.exec(
        "CREATE TABLE IF NOT EXISTS pending_scan_events ("
        "id TEXT PRIMARY KEY,"
        "event_uid TEXT NOT NULL UNIQUE,"
        "student_tag TEXT NOT NULL,"
        "scanned_at TEXT NOT NULL,"
        "route_id TEXT,"
        "metadata_json TEXT NOT NULL,"
        "created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP"
        ")"
    );
}

bool LocalStore::enqueueScan(const PendingScanEvent &event) {
    QSqlDatabase db = QSqlDatabase::database(connectionName());
    QSqlQuery query(db);
    query.prepare(
        "INSERT OR REPLACE INTO pending_scan_events "
        "(id, event_uid, student_tag, scanned_at, route_id, metadata_json) "
        "VALUES (?, ?, ?, ?, ?, ?)"
    );
    query.addBindValue(QUuid::createUuid().toString(QUuid::WithoutBraces));
    query.addBindValue(event.eventUid);
    query.addBindValue(event.studentTag);
    query.addBindValue(event.scannedAt.toUTC().toString(Qt::ISODateWithMs));
    query.addBindValue(event.routeId);
    query.addBindValue(QString::fromUtf8(QJsonDocument(event.metadata).toJson(QJsonDocument::Compact)));
    return query.exec();
}

QList<PendingScanEvent> LocalStore::pendingScans(int limit) const {
    QList<PendingScanEvent> items;
    QSqlDatabase db = QSqlDatabase::database(connectionName());
    QSqlQuery query(db);
    query.prepare(
        "SELECT event_uid, student_tag, scanned_at, route_id, metadata_json "
        "FROM pending_scan_events ORDER BY created_at ASC LIMIT ?"
    );
    query.addBindValue(limit);
    if (!query.exec()) {
        return items;
    }

    while (query.next()) {
        PendingScanEvent event;
        event.eventUid = query.value(0).toString();
        event.studentTag = query.value(1).toString();
        event.scannedAt = QDateTime::fromString(query.value(2).toString(), Qt::ISODateWithMs);
        event.routeId = query.value(3).toString();
        event.metadata = QJsonDocument::fromJson(query.value(4).toByteArray()).object();
        items.append(event);
    }
    return items;
}

bool LocalStore::markSynced(const QStringList &eventUids) {
    if (eventUids.isEmpty()) {
        return true;
    }
    QSqlDatabase db = QSqlDatabase::database(connectionName());
    QSqlQuery query(db);
    QStringList placeholders;
    for (int i = 0; i < eventUids.size(); ++i) {
        placeholders << "?";
    }
    query.prepare(QString("DELETE FROM pending_scan_events WHERE event_uid IN (%1)").arg(placeholders.join(",")));
    for (const QString &uid : eventUids) {
        query.addBindValue(uid);
    }
    return query.exec();
}

int LocalStore::pendingCount() const {
    QSqlDatabase db = QSqlDatabase::database(connectionName());
    QSqlQuery query(db);
    if (!query.exec("SELECT COUNT(*) FROM pending_scan_events") || !query.next()) {
        return 0;
    }
    return query.value(0).toInt();
}
