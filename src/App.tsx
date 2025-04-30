import { differenceInSeconds, isBefore, isSameDay, subDays } from 'date-fns'
import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { combine, persist } from 'zustand/middleware'
import { useShallow } from 'zustand/shallow'
import css from './App.module.scss'

type Record = {
  statusName: string
  startedAt: Date
  finishedAt: Date | null
  durationS?: number
}
type Status = {
  name: string
  type: 'nothing' | 'something'
  backgroundColor: string
  textColor: string
}
type Store = {
  statuses: Status[]
  records: Record[]
}
type TodayStat = {
  statusName: string
  durationS: number
  durationString: string
}

const getInitialState = (): Store => {
  return {
    statuses: [
      {
        type: 'nothing',
        name: '❌',
        backgroundColor: '#bcbcbc',
        textColor: '#434343',
      },
      {
        type: 'something',
        name: '😎',
        backgroundColor: '#000000',
        textColor: '#ffffff',
      },
      {
        type: 'something',
        name: '😴',
        backgroundColor: '#ffffff',
        textColor: '#000000',
      },
    ],
    records: [
      {
        statusName: '❌',
        startedAt: new Date(),
        finishedAt: null,
      },
    ],
  }
}

const getRecordDurationS = (record: Record) => {
  if (record.durationS) {
    return record.durationS
  }
  const finishedAt = record.finishedAt || new Date()
  return differenceInSeconds(finishedAt, record.startedAt)
}

const getRecordDurationStringByDurationS = (durationS: number) => {
  const hours = Math.floor(durationS / 3600)
  const minutes = Math.floor(durationS / 60) % 60
  const seconds = durationS % 60
  const pad = (value: number) => value.toString().padStart(2, '0')
  const hoursString = hours > 0 ? `${hours}:` : ''
  const minuteString = hours > 0 ? `${pad(minutes)}:` : `${minutes}:`
  return `${hoursString}${minuteString}${pad(seconds)}`
}

const useStore = create(
  persist(
    combine(getInitialState(), (set, get) => {
      const getCurrentRecord = () => {
        const currentRecord = get().records[0]
        if (!currentRecord) {
          throw new Error('No current record found')
        }
        return currentRecord
      }

      const getCurrentStatus = () => {
        const currentStatus = get().statuses.find((status) => status.name === getCurrentRecord().statusName)
        if (!currentStatus) {
          return get().statuses.find((status) => status.type === 'nothing') || get().statuses[0]
        }
        return currentStatus
      }

      const getOtherStatuses = () => {
        return get().statuses.filter((status) => status.name !== getCurrentRecord().statusName)
      }

      const start = (statusName: string) => {
        const status = get().statuses.find((status) => status.name === statusName)
        if (!status) {
          throw new Error(`Status ${statusName} not found`)
        }
        const [currentRecord, ...restRecords] = get().records
        if (!currentRecord) {
          throw new Error('No current record found')
        }
        const updatedCurrentRecord = {
          ...currentRecord,
          finishedAt: new Date(),
          durationS: getRecordDurationS(currentRecord),
        }
        const nextRecord: Record = {
          statusName,
          startedAt: new Date(),
          finishedAt: null,
        }
        const nextRecords = [nextRecord, updatedCurrentRecord, ...restRecords]
        set({ records: nextRecords })
        removeBadRecords()
      }

      const getTodayStats = () => {
        const today = new Date()
        const statuses = get().statuses
        const records = get().records
        const stats: Array<TodayStat> = []

        for (const record of records) {
          const isToday =
            isSameDay(record.startedAt, today) || (record.finishedAt && isSameDay(record.finishedAt, today))
          if (!isToday) {
            continue
          }
          const status = statuses.find((status) => status.name === record.statusName)
          const stat = stats.find((stat) => stat.statusName === record.statusName)
          if (!stat) {
            // const isNotNothing = !status || status.type !== 'nothing'
            // const isNotNothing = status && status.type !== 'nothing'
            const isNotNothing = !!status
            if (isNotNothing) {
              const durationS = getRecordDurationS(record)
              stats.push({
                statusName: record.statusName,
                durationS,
                durationString: '',
              })
            }
          } else {
            stat.durationS += getRecordDurationS(record)
          }
        }

        return stats
          .sort((a, b) => {
            const aIndex = statuses.findIndex((status) => status.name === a.statusName)
            const bIndex = statuses.findIndex((status) => status.name === b.statusName)
            return aIndex - bIndex
          })
          .map((stat) => ({
            ...stat,
            durationString: getRecordDurationStringByDurationS(stat.durationS),
          }))
      }

      const removeBadRecords = () => {
        const tooOldDate = subDays(new Date(), 30)
        const tooShortDurationS = 3
        const isBadRecord = (record: Record) => {
          if (!record.finishedAt) {
            return false
          }
          const durationS = getRecordDurationS(record)
          const isTooShort = durationS < tooShortDurationS
          if (isTooShort) {
            return true
          }
          const isTooOld = isBefore(record.finishedAt, tooOldDate)
          return isTooOld
        }
        const goodRecords = get().records.filter((record) => {
          return !isBadRecord(record)
        })
        set({ records: goodRecords })
      }

      const resetStatuses = () => {
        set({ statuses: getInitialState().statuses })
      }

      return {
        getTodayStats,
        getCurrentRecord,
        getCurrentStatus,
        getOtherStatuses,
        start,
        resetStatuses,
        removeBadRecords,
      }
    }),
    {
      name: 'chedoro-storage',
    }
  )
)

const setCssVariable = (name: string, value: string) => {
  document.documentElement.style.setProperty(name, value)
}

const setMetaThemeColor = (color: string) => {
  let meta = document.querySelector('meta[name=theme-color]')
  if (!meta) {
    meta = document.createElement('meta')
    meta.setAttribute('name', 'theme-color')
    document.head.appendChild(meta)
  }
  meta.setAttribute('content', color)
}

function App() {
  const currentRecord = useStore(useShallow((state) => state.getCurrentRecord()))
  const otherStatuses = useStore(useShallow((state) => state.getOtherStatuses()))
  const currentStatus = useStore(useShallow((state) => state.getCurrentStatus()))
  const [todayStats, setTodayStats] = useState<Array<TodayStat>>([])
  const currentStatusName = currentStatus.name
  const currentRecordStartedAt = currentRecord.startedAt
  const [currentDurationString, setCurrentDurationString] = useState('')

  useEffect(() => {
    useStore.getState().resetStatuses()
  }, [])

  useEffect(() => {
    setCssVariable('--main-background-color', currentStatus.backgroundColor)
    setCssVariable('--main-text-color', currentStatus.textColor)
    setMetaThemeColor(currentStatus.backgroundColor)
  }, [currentStatus.backgroundColor, currentStatus.textColor])

  const updateCurrentDurationString = () => {
    const currentRecord = useStore.getState().getCurrentRecord()
    const durationS = getRecordDurationS(currentRecord)
    const durationString = getRecordDurationStringByDurationS(durationS)
    setCurrentDurationString(durationString)
  }

  const updateTodayStats = () => {
    const todayStats = useStore.getState().getTodayStats()
    setTodayStats(todayStats)
  }

  useEffect(() => {
    const interval = setInterval(() => {
      updateCurrentDurationString()
      updateTodayStats()
    }, 1000)
    updateCurrentDurationString()
    updateTodayStats()
    return () => clearInterval(interval)
  }, [currentRecordStartedAt])

  return (
    <div className={css.app}>
      <div className={css.header}>
        <div className={css.todayStats}>
          {todayStats.map((stat) => (
            <div className={css.todayStat} key={stat.statusName}>
              <div className={css.todayStatName}>{stat.statusName}</div>
              <div className={css.todayStatDuration}>{stat.durationString}</div>
            </div>
          ))}
        </div>
      </div>
      <div className={css.main}>
        <div className={css.currentStatusName}>{currentStatusName}</div>
        <div className={css.currentDuration}>{currentDurationString}</div>
      </div>
      <div className={css.footer}>
        <div className={css.statusesButtons}>
          {otherStatuses
            .filter((status) => status.name!)
            .map((status) => (
              <button
                className={css.statusButton}
                key={status.name}
                style={{ backgroundColor: status.backgroundColor }}
                onClick={() => {
                  useStore.getState().start(status.name)
                  updateCurrentDurationString()
                }}
              >
                {status.name}
              </button>
            ))}
        </div>
      </div>
    </div>
  )
}

export default App
