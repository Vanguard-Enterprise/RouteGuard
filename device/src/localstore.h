#pragma once

#include <QDateTime>
#include <QJsonObject>
#include <QList>
#include <QObject>
#include <QString>

struct PendingScanEvent {
    QString eventUid;
    QString studentTag;
    QDateTime scannedAt;
    QString routeId;
    QJsonObject metadata;
};

class LocalStore : public QObject {
    Q_OBJECT
public:
    explicit LocalStore(QObject *parent = nullptr);

    bool initialize();
    bool enqueueScan(const PendingScanEvent &event);
    QList<PendingScanEvent> pendingScans(int limit = 100) const;
    bool markSynced(const QStringList &eventUids);
    int pendingCount() const;

private:
    QString databasePath() const;
    QString connectionName() const;
};
