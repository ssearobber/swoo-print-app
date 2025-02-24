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
  const query = `
    query getOrders($cursor: String) {
      orders(first: 100, after: $cursor, sortKey: CREATED_AT, reverse: true) {
        nodes {
          name
          id
          createdAt
          customer {
            displayName
          }
          displayFinancialStatus
          displayFulfillmentStatus
          lineItems(first: 100) {
            edges {
              node {
                title
                quantity
                originalUnitPriceSet {
                  presentmentMoney {
                    amount
                    currencyCode
                  }
                }
              }
            }
          }
          totalPriceSet {
            presentmentMoney {
              amount
              currencyCode
            }
          }
          subtotalPriceSet { 
            presentmentMoney { 
              amount 
              currencyCode 
            } 
          }
          totalTaxSet {
            presentmentMoney {
              amount
              currencyCode
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
          hasPreviousPage
          startCursor
        }
      }
    }
  `;
  
  const response = await admin.graphql(
    query,
    {
      variables: {
        cursor: cursor
      }
    }
  );
  return response.json();
}

export const loader = async ({ request }) => {
  try {
    const { admin } = await authenticate.admin(request);
    const url = new URL(request.url);
    const currentPage = parseInt(url.searchParams.get("page")) || 1;
    const pageSize = 250;
    
    // 첫 페이지 데이터 가져오기
    const initialData = await fetchOrders(admin);
    if (!initialData) {
      throw new Error('Failed to fetch orders from Shopify');
    }

    let orders = initialData.data.orders.nodes;
    let pageInfo = initialData.data.orders.pageInfo;
    let totalOrders = orders.length;
    
    console.log('첫 페이지 데이터:', {
      현재페이지: currentPage,
      다음페이지: pageInfo.hasNextPage,
      이전페이지: pageInfo.hasPreviousPage,
      시작커서: pageInfo.startCursor,
      마지막커서: pageInfo.endCursor,
      현재_페이지_주문수: orders.length
    });

    // 요청된 페이지까지 데이터 가져오기
    let currentPageCount = 1;
    while (pageInfo.hasNextPage && currentPageCount < currentPage) {
      const nextData = await fetchOrders(admin, pageInfo.endCursor);
      if (!nextData) break;
      
      const newOrders = nextData.data.orders.nodes;
      orders = [...orders, ...newOrders];
      pageInfo = nextData.data.orders.pageInfo;
      currentPageCount++;
      totalOrders += newOrders.length;
      
      console.log('추가 페이지 로드:', {
        페이지번호: currentPageCount,
        누적주문수: totalOrders,
        현재_페이지_주문수: newOrders.length,
        다음페이지존재: pageInfo.hasNextPage,
        마지막커서: pageInfo.endCursor
      });
    }

    const formattedOrders = orders
      .slice((currentPage - 1) * pageSize, currentPage * pageSize)
      .map(node => ({
        id: node.name,
        order: node.id,
        displayName: node.customer?.displayName || '顧客情報無し',
        totalPrice: formatCurrency(parseFloat(node.totalPriceSet.presentmentMoney.amount)),
        subtotalPrice: formatCurrency(parseFloat(node.subtotalPriceSet.presentmentMoney.amount)),
        totalTax: formatCurrency(parseFloat(node.totalTaxSet.presentmentMoney.amount)),
        displayFinancialStatus: node.displayFinancialStatus,
        displayFulfillmentStatus: node.displayFulfillmentStatus,
        createdAt: node.createdAt.split('T')[0],
        items: node.lineItems.edges,
      }))
      .sort((a, b) => b.id.localeCompare(a.id));

    return json({
      orders: formattedOrders,
      pagination: {
        currentPage,
        totalItems: totalOrders,
        pageSize,
        hasNextPage: pageInfo.hasNextPage,
        hasPreviousPage: currentPage > 1,
        totalPages: Math.ceil(totalOrders / pageSize)
      }
    });
  } catch (error) {
    console.error('app._index Loader Error : ', error);
    return json({ error: 'Failed to fetch orders.' }, { status: 500 });
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
        <IndexTable.Cell>{order.createdAt}</IndexTable.Cell>
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
                label={`${pagination.currentPage} / ${pagination.totalPages} 페이지`}
                hasPrevious={pagination.currentPage > 1}
                hasNext={pagination.currentPage < pagination.totalPages}
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