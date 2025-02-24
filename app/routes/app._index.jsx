import { useState } from "react";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import {
  Page,
  Layout,
  Text,
  Card,
  IndexTable,
  useBreakpoints,
  Button,
  Pagination,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import PrintModal from "../utils/printModal";

async function fetchOrders(admin, cursor = null) {
  try {
    let url = `/admin/api/2024-01/orders.json?limit=100&status=any`;
    if (cursor) {
      url += `&page_info=${cursor}`;
    }

    const response = await admin.rest.get({
      path: url
    });

    // response.body를 JSON으로 파싱
    const responseData = await response.json();
    
    if (!responseData?.orders) {
      console.error('주문 데이터가 없습니다:', responseData);
      return {
        data: {
          orders: {
            nodes: [],
            pageInfo: {
              hasNextPage: false,
              endCursor: null,
              hasPreviousPage: false,
              startCursor: null
            }
          }
        }
      };
    }

    // Link 헤더에서 다음 페이지 정보 추출
    const linkHeader = response.headers.get('Link') || '';
    const nextLink = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
    const nextCursor = nextLink ? new URL(nextLink[1]).searchParams.get('page_info') : null;

    return {
      data: {
        orders: {
          nodes: responseData.orders.map(order => ({
            name: order.name || '',
            id: order.id?.toString() || '',
            processedAt: order.processed_at || '',
            customer: {
              displayName: order.customer ? 
                `${order.customer.first_name || ''} ${order.customer.last_name || ''}`.trim() : 
                null
            },
            displayFinancialStatus: order.financial_status || '',
            displayFulfillmentStatus: order.fulfillment_status || '',
            lineItems: {
              edges: (order.line_items || []).map(item => ({
                node: {
                  title: item.title || '',
                  quantity: item.quantity || 0,
                  originalUnitPriceSet: {
                    presentmentMoney: {
                      amount: item.price || '0',
                      currencyCode: order.currency || 'JPY'
                    }
                  }
                }
              }))
            },
            totalPriceSet: {
              presentmentMoney: {
                amount: order.total_price || '0',
                currencyCode: order.currency || 'JPY'
              }
            },
            subtotalPriceSet: {
              presentmentMoney: {
                amount: order.subtotal_price || '0',
                currencyCode: order.currency || 'JPY'
              }
            },
            totalTaxSet: {
              presentmentMoney: {
                amount: order.total_tax || '0',
                currencyCode: order.currency || 'JPY'
              }
            }
          })),
          pageInfo: {
            hasNextPage: !!nextCursor,
            endCursor: nextCursor,
            hasPreviousPage: !!cursor,
            startCursor: cursor
          }
        }
      }
    };
  } catch (error) {
    console.error('주문 데이터 가져오기 에러:', error);
    throw error;
  }
}

export const loader = async ({ request }) => {
  try {
    const { admin } = await authenticate.admin(request);
    const url = new URL(request.url);
    let currentPage = parseInt(url.searchParams.get("page")) || 1;
    
    let cursor = null;
    let orders = [];
    let pageInfo = null;

    // 현재 페이지까지 순차적으로 데이터 가져오기
    for (let i = 1; i <= currentPage; i++) {
      const data = await fetchOrders(admin, cursor);
      
      if (!data?.data?.orders?.nodes) {
        console.error('데이터 형식 오류:', data);
        break;
      }

      if (i === currentPage) {
        // 현재 페이지의 데이터만 저장
        orders = data.data.orders.nodes;
        pageInfo = data.data.orders.pageInfo;
      }
      
      // 다음 페이지를 위한 커서 업데이트
      cursor = data.data.orders.pageInfo.endCursor;
      
      console.log(`${i}페이지 데이터 로드:`, {
        커서: cursor,
        주문수: data.data.orders.nodes.length,
        마지막주문날짜: data.data.orders.nodes[data.data.orders.nodes.length-1]?.processedAt
      });
    }

    console.log('페이지 데이터:', {
      현재페이지: currentPage,
      다음페이지: pageInfo?.hasNextPage || false,
      이전페이지: currentPage > 1,
      시작커서: pageInfo?.startCursor,
      마지막커서: pageInfo?.endCursor,
      현재_페이지_주문수: orders.length,
      cursor: cursor
    });

    const formattedOrders = orders
      .map(node => ({
        id: node.name,
        order: node.id,
        displayName: node.customer?.displayName || '顧客情報無し',
        totalPrice: formatCurrency(parseFloat(node.totalPriceSet.presentmentMoney.amount)),
        subtotalPrice: formatCurrency(parseFloat(node.subtotalPriceSet.presentmentMoney.amount)),
        totalTax: formatCurrency(parseFloat(node.totalTaxSet.presentmentMoney.amount)),
        displayFinancialStatus: node.displayFinancialStatus,
        displayFulfillmentStatus: node.displayFulfillmentStatus,
        processedAt: node.processedAt.split('T')[0],
        items: node.lineItems.edges,
      }))
      .sort((a, b) => b.id.localeCompare(a.id));

    return json({
      orders: formattedOrders,
      pagination: {
        currentPage,
        hasNextPage: pageInfo?.hasNextPage || false,
        hasPreviousPage: currentPage > 1
      }
    });
  } catch (error) {
    console.error('app._index Loader Error : ', error);
    return json({ 
      orders: [],
      pagination: {
        currentPage: 1,
        hasNextPage: false,
        hasPreviousPage: false
      },
      error: 'Failed to fetch orders.' 
    }, { status: 500 });
  }
};

const formatCurrency = (amount) => {
  return new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(amount);
};

export default function Index() {
  const { orders, pagination } = useLoaderData();
  const [selectedOrder, setSelectedOrder] = useState(null);
  const navigate = useNavigate();

  const handlePageChange = (newPage) => {
    navigate(`?page=${newPage}`);
  };

  const resourceName = {
    singular: 'order',
    plural: 'orders',
  };

  const rowMarkup = orders.map((order, index) => (
    <IndexTable.Row id={order.id} key={order.id} position={index}>
        <IndexTable.Cell>
          <Text variant="bodyMd" fontWeight="bold" as="span">
            {order.id}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>{order.processedAt}</IndexTable.Cell>
        <IndexTable.Cell>{order.displayName}</IndexTable.Cell>
        <IndexTable.Cell>
          <Text as="span">
            {order.totalPrice}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>{order.displayFinancialStatus}</IndexTable.Cell>
        <IndexTable.Cell>{order.displayFulfillmentStatus}</IndexTable.Cell>
        <IndexTable.Cell>
        <Button onClick={() => setSelectedOrder(order)}>領収書</Button>
        </IndexTable.Cell>
      </IndexTable.Row>
  ));

  return (
    <Page fullWidth>
      <Layout>
        <Layout.Section>
          <Card>
            <IndexTable
              condensed={useBreakpoints().smDown}
              resourceName={resourceName}
              itemCount={orders.length}
              headings={[
                {title: '注文'},
                {title: '日付'},
                {title: 'お客様（請求先／配送先）'},
                {title: '合計'},
                {title: '支払い'},
                {title: 'フルフィルメント'},
                {title: ''},
              ]}
              selectable={false}
            >
              {rowMarkup}
            </IndexTable>
            <div style={{ padding: '16px', display: 'flex', justifyContent: 'center' }}>
              <Pagination
                label={`${pagination.currentPage} 페이지`}
                hasPrevious={pagination.hasPreviousPage}
                hasNext={pagination.hasNextPage}
                onPrevious={() => handlePageChange(pagination.currentPage - 1)}
                onNext={() => handlePageChange(pagination.currentPage + 1)}
              />
            </div>
          </Card>
        </Layout.Section>
      </Layout>
      {selectedOrder && (
        <PrintModal
          order={selectedOrder}
          open={() => setSelectedOrder(null)}
        />
      )}
    </Page>
  );
}