import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import cx from 'classnames'
import { useParams } from 'react-router-dom'
import { isUndefined } from 'lodash'

import {
  EuiText,
  EuiToolTip,
  EuiTextColor,
  EuiLoadingContent,
} from '@elastic/eui'
import {
  formatBytes,
  truncateNumberToDuration,
  truncateNumberToFirstUnit,
  truncateTTLToSeconds,
  replaceSpaces,
  formatLongName,
  bufferToString,
  bufferFormatRangeItems,
  getUrl,
} from 'uiSrc/utils'
import {
  NoKeysToDisplayText,
  NoResultsFoundText,
  FullScanNoResultsFoundText,
  ScanNoResultsFoundText,
} from 'uiSrc/constants/texts'
import {
  keysDataSelector,
  keysSelector,
  selectedKeySelector,
  setLastBatchKeys,
  sourceKeysFetch,
} from 'uiSrc/slices/browser/keys'
import {
  appContextBrowser,
  setBrowserKeyListScrollPosition
} from 'uiSrc/slices/app/context'
import { GroupBadge } from 'uiSrc/components'
import ApiEndpoints, { SCAN_COUNT_DEFAULT } from 'uiSrc/constants/api'
import { KeysStoreData, KeyViewType } from 'uiSrc/slices/interfaces/keys'
import VirtualTable from 'uiSrc/components/virtual-table/VirtualTable'
import { ITableColumn } from 'uiSrc/components/virtual-table/interfaces'
import { OVER_RENDER_BUFFER_COUNT, Pages, TableCellAlignment, TableCellTextAlignment } from 'uiSrc/constants'
import { IKeyPropTypes } from 'uiSrc/constants/prop-types/keys'
import { getBasedOnViewTypeEvent, sendEventTelemetry, TelemetryEvent } from 'uiSrc/telemetry'
import { apiService } from 'uiSrc/services'
import { appInfoSelector } from 'uiSrc/slices/app/info'

import { GetKeyInfoResponse } from 'apiSrc/modules/browser/dto'
import styles from './styles.module.scss'

export interface Props {
  hideHeader?: boolean
  keysState: KeysStoreData
  loading: boolean
  hideFooter?: boolean
  selectKey: ({ rowData }: { rowData: any }) => void
  loadMoreItems?: (
    oldKeys: IKeyPropTypes[],
    { startIndex, stopIndex }: { startIndex: number, stopIndex: number },
  ) => void
}

const KeyList = forwardRef((props: Props, ref) => {
  let wheelTimer = 0
  const { selectKey, loadMoreItems, loading, keysState, hideFooter } = props

  const { instanceId = '' } = useParams<{ instanceId: string }>()

  const { data: selectedKey } = useSelector(selectedKeySelector)
  const { total, nextCursor, previousResultCount } = useSelector(keysDataSelector)
  const { isSearched, isFiltered, viewType } = useSelector(keysSelector)
  const { keyList: { scrollTopPosition } } = useSelector(appContextBrowser)
  const { encoding } = useSelector(appInfoSelector)

  const [items, setItems] = useState(keysState.keys)

  const firstBatchRef = useRef(true)
  const itemsRef = useRef(keysState.keys)
  const formattedLastIndexRef = useRef(OVER_RENDER_BUFFER_COUNT)

  const dispatch = useDispatch()

  useImperativeHandle(ref, () => ({
    handleLoadMoreItems(config: { startIndex: number; stopIndex: number }) {
      onLoadMoreItems(config)
    }
  }))

  useEffect(() => {

    return () => {
      if (viewType === KeyViewType.Tree) {
        return
      }
      setItems((prevItems) => {
        dispatch(setLastBatchKeys(prevItems.slice(-SCAN_COUNT_DEFAULT)))
        return []
      })
    }
  }, [])

  useEffect(() => {
    const tempItems = [...keysState.keys]

    if (firstBatchRef.current && items.length !== 0) {
      return
    }

    if (items.length === 0 && tempItems.length === 0) {
      itemsRef.current = tempItems
      return
    }
    const [startIndex, newKeys] = bufferFormatRangeItems(keysState.keys, 0, OVER_RENDER_BUFFER_COUNT, formatItem)

    tempItems.splice(itemsRef.current.length, newKeys.length, ...newKeys)
    itemsRef.current = tempItems

    uploadMetadata(startIndex, OVER_RENDER_BUFFER_COUNT, newKeys)

    if (keysState.keys.length < items.length) {
      formattedLastIndexRef.current = 0
    }

    setItems(tempItems)
  }, [keysState.keys])

  const onNoKeysLinkClick = () => {
    sendEventTelemetry({
      event: getBasedOnViewTypeEvent(
        viewType,
        TelemetryEvent.BROWSER_WORKBENCH_LINK_CLICKED,
        TelemetryEvent.TREE_VIEW_WORKBENCH_LINK_CLICKED
      ),
      eventData: {
        databaseId: instanceId,
      }
    })
  }

  const getNoItemsMessage = () => {
    if (total === 0) {
      return NoKeysToDisplayText(Pages.workbench(instanceId), onNoKeysLinkClick)
    }
    if (isSearched) {
      return keysState.scanned < total ? ScanNoResultsFoundText : FullScanNoResultsFoundText
    }
    if (isFiltered && keysState.scanned < total) {
      return ScanNoResultsFoundText
    }
    return NoResultsFoundText
  }

  const onLoadMoreItems = (props: { startIndex: number, stopIndex: number }) => {
    if (!loadMoreItems) {
      return
    }

    firstBatchRef.current = false
    const itemsTemp = [...itemsRef.current]
    const [startIndex, formattedAllKeys] = bufferFormatRangeItems(
      items, formattedLastIndexRef.current, items.length, formatItem
    )

    itemsTemp.splice(startIndex, formattedAllKeys.length, ...formattedAllKeys)
    itemsRef.current = itemsTemp
    loadMoreItems?.(itemsTemp, props)
  }

  const onWheelSearched = (event: React.WheelEvent) => {
    if (
      !loading
      && (isSearched || isFiltered)
      && event.deltaY > 0
      && !sourceKeysFetch
      && nextCursor !== '0'
      && previousResultCount === 0
    ) {
      clearTimeout(wheelTimer)
      wheelTimer = window.setTimeout(() => {
        onLoadMoreItems({ stopIndex: SCAN_COUNT_DEFAULT, startIndex: 1 })
      }, 100)
    }
  }

  const setScrollTopPosition = (position: number) => {
    dispatch(setBrowserKeyListScrollPosition(position))
  }

  const formatItem = useCallback((item: GetKeyInfoResponse): GetKeyInfoResponse => ({
    ...item,
    nameString: bufferToString(item.name)
  }), [])

  const onRowsRendered = (lastIndex: number) => {
    const [startIndex, newItems] = bufferFormatRows(lastIndex)

    uploadMetadata(startIndex, lastIndex, newItems)

    if (lastIndex > formattedLastIndexRef.current) {
      formattedLastIndexRef.current = lastIndex
    }
  }

  const bufferFormatRows = (lastIndex: number): [number, GetKeyInfoResponse[]] => {
    const tempItems = [...itemsRef.current]
    const [startIndex, newItems] = bufferFormatRangeItems(
      itemsRef.current, formattedLastIndexRef.current, lastIndex, formatItem
    )

    tempItems.splice(startIndex, newItems.length, ...newItems)

    itemsRef.current = tempItems

    setItems(tempItems)

    return [startIndex, newItems]
  }

  const uploadMetadata = async (
    prevIndex: number,
    lastIndex: number,
    itemsInit: GetKeyInfoResponse[] = []
  ): Promise<void> => {
    if (
      prevIndex === lastIndex
      || prevIndex > lastIndex
      || !itemsInit.length
      || !isUndefined(itemsInit[itemsInit.length - 1]?.type)
    ) {
      return
    }

    try {
      const { data, status } = await apiService.post<GetKeyInfoResponse[]>(
        getUrl(
          instanceId,
          ApiEndpoints.KEYS_INFO
        ),
        {
          keys: itemsInit.map(({ name }) => name),
          // cancelToken: sourceKeysFetch.token,
        },
        { params: { encoding } }
      )

      const loadedItems = data.map(formatItem)
      const itemsTemp = [...itemsRef.current]
      itemsTemp.splice(prevIndex, loadedItems.length, ...loadedItems)

      itemsRef.current = itemsTemp
      setItems(itemsTemp)
    } catch (error) {
      console.error(error)
    }
  }

  const columns: ITableColumn[] = [
    {
      id: 'type',
      label: 'Type',
      absoluteWidth: 'auto',
      minWidth: 126,
      render: (cellData: any, { nameString: name }: any) => (
        isUndefined(cellData)
          ? <EuiLoadingContent lines={1} className={styles.keyInfoLoading} />
          : <GroupBadge type={cellData} name={name} />
      )
    },
    {
      id: 'nameString',
      label: 'Key',
      minWidth: 100,
      truncateText: true,
      render: (cellData: string = '') => {
        // Better to cut the long string, because it could affect virtual scroll performance
        const name = cellData
        const cellContent = replaceSpaces(name?.substring(0, 200))
        const tooltipContent = formatLongName(name)
        return (
          <EuiText color="subdued" size="s" style={{ maxWidth: '100%' }}>
            <div style={{ display: 'flex' }} className="truncateText" data-testid={`key-${name}`}>
              <EuiToolTip
                title="Key Name"
                className={styles.tooltip}
                anchorClassName="truncateText"
                position="bottom"
                content={tooltipContent}
              >
                <>{cellContent}</>
              </EuiToolTip>
            </div>
          </EuiText>
        )
      }
    },
    {
      id: 'ttl',
      label: 'TTL',
      absoluteWidth: 86,
      minWidth: 86,
      truncateText: true,
      alignment: TableCellAlignment.Right,
      render: (cellData: number, { nameString: name }: GetKeyInfoResponse) => {
        if (isUndefined(cellData)) {
          return <EuiLoadingContent lines={1} className={styles.keyInfoLoading} />
        }
        if (cellData === -1) {
          return (
            <EuiTextColor color="subdued" data-testid={`ttl-${name}`}>
              No limit
            </EuiTextColor>
          )
        }
        return (
          <EuiText color="subdued" size="s" style={{ maxWidth: '100%' }}>
            <div style={{ display: 'flex' }} className="truncateText" data-testid={`ttl-${name}`}>
              <EuiToolTip
                title="Time to Live"
                className={styles.tooltip}
                anchorClassName="truncateText"
                position="right"
                content={(
                  <>
                    {`${truncateTTLToSeconds(cellData)} s`}
                    <br />
                    {`(${truncateNumberToDuration(cellData)})`}
                  </>
                )}
              >
                <>{truncateNumberToFirstUnit(cellData)}</>
              </EuiToolTip>
            </div>
          </EuiText>
        )
      },
    },
    {
      id: 'size',
      label: 'Size',
      absoluteWidth: 84,
      minWidth: 84,
      alignment: TableCellAlignment.Right,
      textAlignment: TableCellTextAlignment.Right,
      render: (cellData: number, { nameString: name }: GetKeyInfoResponse) => {
        if (isUndefined(cellData)) {
          return <EuiLoadingContent lines={1} className={styles.keyInfoLoading} />
        }

        if (!cellData) {
          return (
            <EuiText color="subdued" size="s" style={{ maxWidth: '100%' }} data-testid={`size-${name}`}>
              -
            </EuiText>
          )
        }
        return (
          <EuiText color="subdued" size="s" style={{ maxWidth: '100%' }}>
            <div style={{ display: 'flex' }} className="truncateText" data-testid={`size-${name}`}>
              <EuiToolTip
                title="Key Size"
                className={styles.tooltip}
                anchorClassName="truncateText"
                position="right"
                content={(
                  <>
                    {formatBytes(cellData, 3)}
                  </>
                )}
              >
                <>{formatBytes(cellData, 0)}</>
              </EuiToolTip>
            </div>
          </EuiText>
        )
      }
    },
  ]

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <div className={cx(styles.table, { [styles.table__withoutFooter]: hideFooter })}>
          <div className="key-list-table" data-testid="keyList-table">
            <VirtualTable
              selectable
              onRowClick={selectKey}
              headerHeight={0}
              rowHeight={43}
              threshold={50}
              columns={columns}
              loadMoreItems={onLoadMoreItems}
              onWheel={onWheelSearched}
              loading={loading}
              // items={items}
              items={itemsRef.current}
              totalItemsCount={keysState.total ? keysState.total : Infinity}
              scanned={isSearched || isFiltered ? keysState.scanned : 0}
              noItemsMessage={getNoItemsMessage()}
              selectedKey={selectedKey}
              scrollTopProp={scrollTopPosition}
              setScrollTopPosition={setScrollTopPosition}
              hideFooter={hideFooter}
              onRowsRendered={({ overscanStopIndex }) => onRowsRendered(overscanStopIndex)}
            />
          </div>
        </div>
      </div>
    </div>
  )
})

export default KeyList
