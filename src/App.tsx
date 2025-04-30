import { differenceInSeconds, isBefore, isSameDay, subDays, subSeconds } from 'date-fns'
import { useCallback, useEffect, useState } from 'react'
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
        type: 'something',
        name: '🧠',
        backgroundColor: '#ffeefa',
        textColor: '#a58989',
      },
      {
        type: 'something',
        name: '😎',
        backgroundColor: '#000000',
        textColor: '#ffffff',
      },
      {
        type: 'something',
        name: '😊',
        backgroundColor: '#ffffff',
        textColor: '#000000',
      },
      {
        type: 'nothing',
        name: '❌',
        backgroundColor: '#e6e6e6',
        textColor: '#434343',
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

const getDurationSByDurationString = (durationString: string): number => {
  const parts = durationString.split(':').map(Number)
  if (parts.some(isNaN)) {
    throw new Error('Invalid duration string')
  }
  const isNegative = durationString.startsWith('-')
  if (isNegative) {
    parts[0] = -parts[0]
  }
  const negativeMultiplier = isNegative ? -1 : 1
  if (parts.length === 3) {
    // HH:MM:SS
    const [hours, minutes, seconds] = parts
    return negativeMultiplier * (hours * 3600 + minutes * 60 + seconds)
  } else if (parts.length === 2) {
    // MM:SS
    const [minutes, seconds] = parts
    return negativeMultiplier * (minutes * 60 + seconds)
  } else if (parts.length === 1) {
    // SS
    return negativeMultiplier * parts[0]
  } else {
    throw new Error('Invalid duration string format')
  }
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

      const updateCurrentRecordStartedAtByDurationS = (newDurationS: number) => {
        const currentRecord = getCurrentRecord()
        const currentDurationsS = getRecordDurationS(currentRecord)
        const diffS = newDurationS - currentDurationsS
        const updatedCurrentRecord = {
          ...currentRecord,
          startedAt: subSeconds(currentRecord.startedAt, diffS),
        }
        set({ records: [updatedCurrentRecord, ...get().records.slice(1)] })
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
        // const stats: Array<TodayStat> = []
        const stats: Array<TodayStat> = statuses.map((status) => ({
          statusName: status.name,
          durationS: 0,
          durationString: '',
        }))

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
          const isTooShort = Math.abs(durationS) < tooShortDurationS
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

      const resetStore = () => {
        set(getInitialState())
      }

      return {
        getTodayStats,
        getCurrentRecord,
        updateCurrentRecordStartedAtByDurationS,
        getCurrentStatus,
        getOtherStatuses,
        start,
        resetStatuses,
        removeBadRecords,
        resetStore,
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

const ManyClickDiv = ({
  desiredCount = 3,
  children,
  onMultyClick,
  onClick,
  ...props
}: {
  desiredCount: number
  children: React.ReactNode
  onMultyClick: () => void
  onClick?: () => void
} & React.HTMLAttributes<HTMLDivElement>) => {
  const [count, setCount] = useState(0)

  const handleClick = useCallback(() => {
    onClick?.()
    const nextCount = count + 1
    setCount(nextCount)
    if (nextCount >= desiredCount) {
      setCount(0)
      onMultyClick()
    }
  }, [count, onMultyClick, desiredCount, onClick])

  useEffect(() => {
    const interval = setInterval(() => {
      setCount(0)
    }, 5000)
    return () => clearInterval(interval)
  }, [count])

  return (
    <div {...props} onClick={handleClick}>
      {children}
    </div>
  )
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
  // const otherStatuses = useStore(useShallow((state) => state.getOtherStatuses()))
  const currentStatus = useStore(useShallow((state) => state.getCurrentStatus()))
  const updateCurrentRecordStartedAtByDurationS = useStore((state) => state.updateCurrentRecordStartedAtByDurationS)
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
      {/* <div className={css.header}>
        <div className={css.todayStats}>
          {todayStats.map((stat) => (
            <div
              className={css.todayStat}
              key={stat.statusName}
              onClick={() => {
                useStore.getState().start(stat.statusName)
                updateCurrentDurationString()
              }}
            >
              <div className={css.todayStatName}>{stat.statusName}</div>
              <div className={css.todayStatDuration}>{stat.durationString}</div>
            </div>
          ))}
        </div>
      </div> */}
      <div className={css.main}>
        <ManyClickDiv
          desiredCount={3}
          onMultyClick={() => {
            window.location.reload()
          }}
          className={css.currentStatusName}
        >
          {currentStatusName}
        </ManyClickDiv>
        <ManyClickDiv
          desiredCount={7}
          className={css.currentDuration}
          onClick={() => {
            const newDurationString = prompt('Enter new duration', currentDurationString)
            if (!newDurationString) {
              return
            }
            const newDurationS = getDurationSByDurationString(newDurationString)
            updateCurrentRecordStartedAtByDurationS(newDurationS)
            updateCurrentDurationString()
          }}
          onMultyClick={() => {
            useStore.getState().resetStore()
          }}
        >
          {currentDurationString}
        </ManyClickDiv>
      </div>
      <div className={css.footer}>
        <div className={css.todayStats}>
          {todayStats.map((stat) => (
            <div
              className={css.todayStat}
              key={stat.statusName}
              onClick={() => {
                useStore.getState().start(stat.statusName)
                updateCurrentDurationString()
              }}
            >
              <div className={css.todayStatName}>{stat.statusName}</div>
              <div className={css.todayStatDuration}>{stat.durationString}</div>
            </div>
          ))}
        </div>
        {/* <div className={css.statusesButtons}>
          {otherStatuses
            .filter((status) => status.name!)
            .map((status) => (
              <button
                className={css.statusButton}
                key={status.name}
                style={{
                  // backgroundColor: status.backgroundColor,
                  // color: status.textColor,
                  // backgroundColor: 'transparent',
                  // borderColor: status.backgroundColor,
                  borderColor: currentStatus.textColor,
                }}
                onClick={() => {
                  useStore.getState().start(status.name)
                  updateCurrentDurationString()
                }}
              >
                {status.name}
              </button>
            ))}
        </div> */}
      </div>
    </div>
  )
}

export default App
